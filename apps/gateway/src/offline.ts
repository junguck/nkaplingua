/**
 * Mode hors-ligne d'abord (zones blanches).
 *
 * - `TranslationCache` : chaînes traduites par clé, avec leurs contraintes (`max_chars`, charset),
 *   empaquetées au démarrage depuis les catalogues et rechargeables depuis un fichier local.
 * - `Connectivity` : sait si la banque répond ; hors-ligne, on ne la sonde qu'à intervalle fixe,
 *   pour ne pas faire attendre l'utilisateur USSD (3 s de délai) à chaque tour.
 * - `SyncQueue` : corrections et nouvelles traductions acceptées hors-ligne, rejouées au retour du réseau.
 * - `ResilientBank` : enveloppe d'un `BankPort`, détecte la panne réseau et déclenche la synchronisation.
 */

import fs from 'node:fs';
import type {
  BankAccount,
  BankBeneficiary,
  BankBiller,
  BankFeeQuote,
  BankHistoryEntry,
  BankPort,
  BankResult,
  BankTransaction,
  CreateTransactionInput,
  FeeType,
} from './bank.js';
import { MENU_KEYS, message, servedLanguages, type GatewayLanguage, type MessageKey } from './i18n.js';
import { UI_DICTIONARIES } from './ui-dictionaries.js';
import { isGsm7, gsm7Length, toGsm7, truncateGsm7 } from '@nkap/core';

export type Charset = 'gsm7' | 'utf8';

export interface CachedString {
  readonly text: string;
  /** `null` = pas de limite pour cette clé. */
  readonly max_chars: number | null;
  readonly charset: Charset;
}

export const USSD_MAX_CHARS = 182;

const PLACEHOLDER = /\{([a-z_]+)\}/gi;

function placeholders(text: string): string {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => (m[1] ?? '').toLowerCase()))].sort().join(',');
}

/** Violation de contrainte, ou `null` si la chaîne est acceptable. */
export function checkConstraints(text: string, max: number | null, charset: Charset): string | null {
  if (text.trim() === '') return 'EMPTY';
  if (charset === 'gsm7') {
    if (!isGsm7(text)) return 'NOT_GSM7';
    if (max !== null && gsm7Length(text) > max) return 'OVER_LENGTH';
    return null;
  }
  if (max !== null && [...text].length > max) return 'OVER_LENGTH';
  return null;
}

export class TranslationCache {
  private readonly map = new Map<string, CachedString>();

  /** Un cache déjà garni avec les catalogues USSD (gsm7, 182) et écrans (utf8) embarqués. */
  static bundled(): TranslationCache {
    const cache = new TranslationCache();
    for (const language of servedLanguages()) {
      for (const key of USSD_KEYS) {
        const text = message(language, key);
        cache.map.set(cacheKey(language, key), { text, max_chars: USSD_MAX_CHARS, charset: 'gsm7' });
      }
    }
    for (const [language, dictionary] of Object.entries(UI_DICTIONARIES)) {
      for (const [key, text] of Object.entries(dictionary as Record<string, string>)) {
        cache.map.set(cacheKey(language, `ui:${key}`), { text, max_chars: null, charset: 'utf8' });
      }
    }
    return cache;
  }

  get(language: string, key: string): CachedString | undefined {
    return this.map.get(cacheKey(language, key));
  }

  /** Les textes d'écran d'une langue, tels que la sandbox les attend (clé sans préfixe). */
  uiStrings(language: string): Record<string, string> {
    const prefix = `${language}|ui:`;
    const out: Record<string, string> = {};
    for (const [k, v] of this.map) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v.text;
    return out;
  }

  /**
   * Ajoute ou corrige une chaîne. Refuse (retourne la raison) si elle viole `max_chars`, le charset,
   * ou change les emplacements `{x}` de la chaîne déjà connue.
   */
  put(language: string, key: string, text: string, max_chars: number | null, charset: Charset): string | null {
    const violation = checkConstraints(text, max_chars, charset);
    if (violation) return violation;
    const previous = this.map.get(cacheKey(language, key));
    if (previous && placeholders(previous.text) !== placeholders(text)) return 'PLACEHOLDERS';
    this.map.set(cacheKey(language, key), { text, max_chars, charset });
    return null;
  }

  get size(): number {
    return this.map.size;
  }

  toJSON(): Record<string, CachedString> {
    return Object.fromEntries(this.map);
  }

  /** Recharge un instantané ; les entrées invalides sont ignorées, jamais appliquées à moitié. */
  load(snapshot: Readonly<Record<string, CachedString>>): number {
    let loaded = 0;
    for (const [k, v] of Object.entries(snapshot)) {
      if (!v || typeof v.text !== 'string') continue;
      if (checkConstraints(v.text, v.max_chars ?? null, v.charset === 'gsm7' ? 'gsm7' : 'utf8')) continue;
      this.map.set(k, { text: v.text, max_chars: v.max_chars ?? null, charset: v.charset === 'gsm7' ? 'gsm7' : 'utf8' });
      loaded += 1;
    }
    return loaded;
  }

  saveTo(file: string): void {
    fs.writeFileSync(file, JSON.stringify(this.toJSON(), null, 1), 'utf8');
  }

  loadFrom(file: string): number {
    if (!fs.existsSync(file)) return 0;
    return this.load(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CachedString>);
  }

  /** Menu USSD complet, depuis le cache seul : aucun appel réseau, GSM-7, 182 septets. */
  offlineMenu(language: GatewayLanguage): string {
    const pick = (key: string): string => this.get(language, key)?.text ?? message('fr', key as MessageKey);
    const items = MENU_KEYS.map((key, index) => `${index + 1}. ${pick(key)}`);
    const body = `${pick('error.UNREACHABLE')}\n${pick('menu.header')}\n${items.join('\n')}`;
    return truncateGsm7(toGsm7(body), USSD_MAX_CHARS);
  }
}

const USSD_KEYS: readonly MessageKey[] = ['menu.header', ...MENU_KEYS, 'error.UNREACHABLE'];

function cacheKey(language: string, key: string): string {
  return `${language}|${key}`;
}

// ── Connectivité ─────────────────────────────────────────────────────────────

export class Connectivity {
  private offline = false;
  private nextProbe = 0;

  constructor(
    private readonly retryMs = 15_000,
    private readonly now: () => number = Date.now,
  ) {}

  get isOffline(): boolean {
    return this.offline;
  }

  /** En ligne : toujours. Hors-ligne : une sonde toutes les `retryMs`, le reste du temps on répond depuis le cache. */
  shouldAttempt(): boolean {
    return !this.offline || this.now() >= this.nextProbe;
  }

  /** Retourne `true` si on vient de repasser en ligne. */
  markOnline(): boolean {
    const wasOffline = this.offline;
    this.offline = false;
    return wasOffline;
  }

  markOffline(): void {
    this.offline = true;
    this.nextProbe = this.now() + this.retryMs;
  }
}

// ── File de synchronisation ──────────────────────────────────────────────────

export interface QueuedChange {
  readonly id: string;
  readonly kind: 'correction' | 'new';
  readonly language: string;
  readonly key: string;
  readonly text: string;
  readonly max_chars: number | null;
  readonly charset: Charset;
  readonly queuedAt: string;
}

/** Envoie un lot ; `true` = le serveur l'a accepté. Toute autre issue laisse la file intacte. */
export type SyncSender = (changes: readonly QueuedChange[]) => Promise<boolean>;

export class SyncQueue {
  private items: QueuedChange[] = [];
  private counter = 0;
  private flushing = false;

  constructor(private readonly file?: string) {
    if (file && fs.existsSync(file)) {
      try {
        this.items = JSON.parse(fs.readFileSync(file, 'utf8')) as QueuedChange[];
        this.counter = this.items.length;
      } catch {
        this.items = [];
      }
    }
  }

  get pending(): readonly QueuedChange[] {
    return this.items;
  }

  enqueue(change: Omit<QueuedChange, 'id' | 'queuedAt'>): QueuedChange {
    // Une nouvelle correction de la même clé remplace l'ancienne : seul le dernier mot compte.
    this.items = this.items.filter((c) => !(c.language === change.language && c.key === change.key));
    const entry: QueuedChange = { ...change, id: `q${Date.now().toString(36)}-${this.counter++}`, queuedAt: new Date().toISOString() };
    this.items.push(entry);
    this.persist();
    return entry;
  }

  /** Rejoue la file. Retourne le nombre de changements synchronisés. */
  async flush(sender: SyncSender): Promise<number> {
    if (this.flushing || this.items.length === 0) return 0;
    this.flushing = true;
    const batch = [...this.items];
    try {
      const ok = await sender(batch);
      if (!ok) return 0;
      const sent = new Set(batch.map((c) => c.id));
      this.items = this.items.filter((c) => !sent.has(c.id));
      this.persist();
      return batch.length;
    } catch {
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  private persist(): void {
    if (this.file) fs.writeFileSync(this.file, JSON.stringify(this.items, null, 1), 'utf8');
  }
}

// ── Banque résiliente ────────────────────────────────────────────────────────

export class ResilientBank implements BankPort {
  constructor(
    private readonly inner: BankPort,
    private readonly connectivity: Connectivity,
    private readonly onReconnect: () => void = () => undefined,
  ) {}

  account(phone: string): Promise<BankResult<BankAccount>> {
    return this.guard(() => this.inner.account(phone));
  }
  fees(type: FeeType, amount: number): Promise<BankResult<BankFeeQuote>> {
    return this.guard(() => this.inner.fees(type, amount));
  }
  history(phone: string, limit: number): Promise<BankResult<readonly BankHistoryEntry[]>> {
    return this.guard(() => this.inner.history(phone, limit));
  }
  beneficiaries(query: string): Promise<BankResult<readonly BankBeneficiary[]>> {
    return this.guard(() => this.inner.beneficiaries(query));
  }
  billers(): Promise<BankResult<readonly BankBiller[]>> {
    return this.guard(() => this.inner.billers());
  }
  create(input: CreateTransactionInput): Promise<BankResult<BankTransaction>> {
    return this.guard(() => this.inner.create(input));
  }
  update(id: string, patch: { amount?: number; to?: string }): Promise<BankResult<BankTransaction>> {
    return this.guard(() => this.inner.update(id, patch));
  }
  confirm(id: string): Promise<BankResult<BankTransaction>> {
    return this.guard(() => this.inner.confirm(id));
  }
  cancel(id: string): Promise<BankResult<BankTransaction>> {
    return this.guard(() => this.inner.cancel(id));
  }

  private async guard<T>(call: () => Promise<BankResult<T>>): Promise<BankResult<T>> {
    if (!this.connectivity.shouldAttempt()) {
      return { ok: false, status: 0, error: 'UNREACHABLE', message: 'hors-ligne' };
    }
    let result: BankResult<T>;
    try {
      result = await call();
    } catch (error) {
      this.connectivity.markOffline();
      return { ok: false, status: 0, error: 'UNREACHABLE', message: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok && result.status === 0 && result.error === 'UNREACHABLE') {
      this.connectivity.markOffline();
    } else if (this.connectivity.markOnline()) {
      this.onReconnect();
    }
    return result;
  }
}
