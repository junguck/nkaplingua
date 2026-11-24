import type { LanguageCode, TranslationStatus } from '@nkap/contracts';
import type { MessageKey } from '../lexicon/messages.lexicon';
import { message } from '../dialogue/plan';
import { renderPart, weakestStatus, type RenderedText } from '../render/renderer';
import { formatAmount } from '../text/format';
import type { ScreenField, ScreenReading } from './screen-reader';

export type ScreenAlertLevel = 'danger' | 'warning' | 'info';

export interface ScreenCardRow {
  readonly field: ScreenField;
  readonly label: string;
  /** Valeur recopiée de l'écran : montant, nom ou numéro, jamais traduit. */
  readonly value: string;
}

export interface ScreenAlert {
  readonly level: ScreenAlertLevel;
  readonly text: string;
}

/**
 * La « fiche claire » affichée par la bulle. Structure plate et sérialisable :
 * le module natif Kotlin l'affiche telle quelle, sans rien savoir des langues.
 */
export interface ScreenCard {
  readonly lang: LanguageCode;
  readonly title: string;
  readonly rows: readonly ScreenCardRow[];
  readonly alerts: readonly ScreenAlert[];
  readonly status: TranslationStatus;
  readonly fallback: boolean;
}

const FIELD_KEYS: Readonly<Record<ScreenField, MessageKey>> = {
  amount: 'screen.field.amount',
  fee: 'screen.field.fee',
  total: 'screen.field.total',
  balance: 'screen.field.balance',
  recipient: 'screen.field.recipient',
  phone: 'screen.field.phone',
  reference: 'screen.field.reference',
};

export function renderScreenCard(reading: ScreenReading, lang: LanguageCode): ScreenCard {
  const rendered: RenderedText[] = [];
  const say = (key: MessageKey): string => {
    const r = renderPart(message(key), lang);
    rendered.push(r);
    return r.text;
  };

  const rows: ScreenCardRow[] = valuesOf(reading).map(([field, value]) => ({ field, label: say(FIELD_KEYS[field]), value }));
  const alerts: ScreenAlert[] = [];

  if (reading.scam.suspicious) {
    alerts.push({ level: 'danger', text: say('screen.scam.title') });
    alerts.push({ level: 'danger', text: say('screen.scam.advice') });
    for (const reason of reading.scam.reasons) alerts.push({ level: 'warning', text: say(`screen.scam.reason.${reason}`) });
  }
  if (reading.totalCheck === 'mismatch') alerts.push({ level: 'danger', text: say('screen.total.mismatch') });
  if (reading.totalCheck === 'ok') alerts.push({ level: 'info', text: say('screen.total.ok') });
  if (!reading.scam.suspicious && (reading.kind !== null || reading.amount !== null)) alerts.push({ level: 'warning', text: say('screen.check') });
  if (rows.length === 0 && alerts.length === 0) alerts.push({ level: 'info', text: say('screen.empty') });

  const title = say('screen.title');
  return {
    lang,
    title,
    rows,
    alerts,
    status: weakestStatus(rendered.map((r) => r.status)),
    fallback: rendered.some((r) => r.fallback),
  };
}

function valuesOf(r: ScreenReading): Array<readonly [ScreenField, string]> {
  const money = (v: number | null): string | null => (v === null ? null : formatAmount(v));
  const entries: Array<readonly [ScreenField, string | null]> = [
    ['recipient', r.recipientName],
    ['phone', r.recipientPhone],
    ['amount', money(r.amount)],
    ['fee', money(r.fee)],
    ['total', money(r.total)],
    ['balance', money(r.balance)],
    ['reference', r.reference],
  ];
  return entries.filter((e): e is readonly [ScreenField, string] => e[1] !== null);
}
