import type { TransactionalIntent } from '@nkap/contracts';
import { containsCue, fold } from '../text/normalize';
import { scanNumbers } from '../text/numbers';
import { detectScam, type ScamVerdict } from './scam';

/**
 * Lecture PONCTUELLE d'un écran tiers (bulle Android, extension) — ADR 0002.
 * Entrée : les lignes de texte visibles, dans l'ordre de l'arbre d'accessibilité.
 * Sortie : des valeurs métier, jamais traduites, et un verdict anti-arnaque.
 * Aucune valeur n'est devinée : un champ absent de l'écran reste `null`.
 */
export const SCREEN_FIELDS = ['amount', 'fee', 'total', 'balance', 'recipient', 'phone', 'reference'] as const;
export type ScreenField = (typeof SCREEN_FIELDS)[number];

export type TotalCheck = 'ok' | 'mismatch' | 'unknown';

export interface ScreenReading {
  readonly kind: TransactionalIntent | null;
  readonly amount: number | null;
  readonly fee: number | null;
  readonly total: number | null;
  readonly balance: number | null;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
  readonly reference: string | null;
  /** montant + frais = total, vérifié sur les chiffres de l'écran. */
  readonly totalCheck: TotalCheck;
  readonly scam: ScamVerdict;
}

type MoneyField = 'amount' | 'fee' | 'total' | 'balance';

/** Ordre significatif : « montant total » est un total, pas un montant. */
const LABELS: ReadonlyArray<readonly [ScreenField, readonly string[]]> = [
  ['total', ['montant total', 'total a debiter', 'montant a debiter', 'net a payer', 'total a payer', 'total amount', 'amount to pay', 'total']],
  ['fee', ['frais de transfert', 'frais', 'commission', 'fees', 'fee', 'charges']],
  ['balance', ['nouveau solde', 'solde disponible', 'solde', 'new balance', 'available balance', 'balance']],
  ['amount', ['montant', 'somme', 'amount']],
  ['recipient', ['beneficiaire', 'destinataire', 'recipient', 'beneficiary', 'nom du beneficiaire']],
  ['phone', ['numero du beneficiaire', 'numero', 'telephone', 'phone number', 'phone', 'mobile']],
  ['reference', ['reference', 'ref', 'id transaction', 'transaction id']],
];

const KIND_CUES: ReadonlyArray<readonly [TransactionalIntent, readonly string[]]> = [
  ['PAY_BILL', ['facture', 'bill', 'eneo', 'camwater', 'canal']],
  ['BUY_AIRTIME', ['credit de communication', 'recharge', 'airtime', 'forfait']],
  ['WITHDRAW', ['retrait', 'retirer', 'withdraw*', 'cash out']],
  ['TRANSFER', ['transfert', 'envo*', 'transfer*', 'send', 'sent', 'depot vers']],
];

const FREE_RE = /(?:^|\s)(?:0|gratuit|free|offert)(?=\s|$)/;
/** « à Paul Ndi », « to Paul Ndi » : un nom propre après la préposition, dans une phrase. */
const SENTENCE_RECIPIENT_RE = /(?:^|\s)(?:à|a|to|vers)\s+(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u;
const REFERENCE_RE = /[A-Z0-9][A-Z0-9.-]{3,}/i;

interface Draft {
  amount: number | null;
  fee: number | null;
  total: number | null;
  balance: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
  reference: string | null;
}

export function readScreen(rawLines: readonly string[]): ScreenReading {
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const draft: Draft = { amount: null, fee: null, total: null, balance: null, recipientName: null, recipientPhone: null, reference: null };
  const looseAmounts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const folded = fold(raw);
    const label = findLabel(folded);

    if (label === null) {
      collectLoose(raw, folded, draft, looseAmounts);
      continue;
    }

    // Les applis séparent souvent libellé et valeur en deux nœuds : la valeur est alors à la ligne suivante.
    const sameLine = afterLabel(raw, folded, label.cue);
    const next = lines[i + 1] ?? '';
    const useNext = sameLine.trim().length === 0 && next.length > 0 && findLabel(fold(next)) === null;
    const valueRaw = useNext ? next : sameLine;
    if (useNext) i += 1;
    assign(draft, label.field, valueRaw);
  }

  // Phrase seule (« Vous allez envoyer 5 000 FCFA à Paul ») : le premier montant non étiqueté est le montant.
  if (draft.amount === null && looseAmounts.length > 0) draft.amount = looseAmounts[0] ?? null;

  const joined = lines.join('. ');
  return {
    kind: findKind(fold(joined)),
    ...draft,
    totalCheck: checkTotal(draft),
    scam: detectScam(joined),
  };
}

function findLabel(folded: string): { field: ScreenField; cue: string } | null {
  for (const [field, cues] of LABELS) {
    for (const cue of cues) {
      if (folded === cue || folded.startsWith(`${cue} `)) return { field, cue };
    }
  }
  return null;
}

/** Texte brut après le libellé : après « : » s'il existe, sinon après le même nombre de mots. */
function afterLabel(raw: string, folded: string, cue: string): string {
  const colon = raw.indexOf(':');
  if (colon >= 0) return raw.slice(colon + 1);
  const labelWords = cue.split(' ').length;
  return raw.split(/\s+/).slice(labelWords).join(' ').trim() || folded.slice(cue.length).trim();
}

function assign(draft: Draft, field: ScreenField, valueRaw: string): void {
  const folded = fold(valueRaw);
  const numbers = scanNumbers(folded);
  switch (field) {
    case 'amount':
    case 'fee':
    case 'total':
    case 'balance':
      setMoney(draft, field, numbers.amounts[0] ?? (field === 'fee' && FREE_RE.test(folded) ? 0 : null));
      break;
    case 'phone':
      draft.recipientPhone ??= numbers.phones[0] ?? null;
      break;
    case 'recipient': {
      draft.recipientPhone ??= numbers.phones[0] ?? null;
      const name = valueRaw.replace(/\(?\+?[\d\s.-]{9,}\)?/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.length > 0) draft.recipientName ??= name;
      break;
    }
    case 'reference':
      draft.reference ??= REFERENCE_RE.exec(valueRaw)?.[0] ?? null;
      break;
  }
}

function setMoney(draft: Draft, field: MoneyField, value: number | null): void {
  if (value !== null && draft[field] === null) draft[field] = value;
}

function collectLoose(raw: string, folded: string, draft: Draft, looseAmounts: number[]): void {
  const numbers = scanNumbers(folded);
  // Un chiffre de clavier ou de menu (« 1 », « 2 ») n'est pas un montant.
  if (numbers.choice === null) looseAmounts.push(...numbers.amounts);
  draft.recipientPhone ??= numbers.phones[0] ?? null;
  if (draft.recipientName === null && numbers.amounts.length > 0) {
    draft.recipientName = SENTENCE_RECIPIENT_RE.exec(raw)?.[1] ?? null;
  }
}

function findKind(folded: string): TransactionalIntent | null {
  for (const [kind, cues] of KIND_CUES) {
    if (cues.some((c) => containsCue(folded, c))) return kind;
  }
  return null;
}

function checkTotal(d: Draft): TotalCheck {
  if (d.amount === null || d.fee === null || d.total === null) return 'unknown';
  return d.amount + d.fee === d.total ? 'ok' : 'mismatch';
}
