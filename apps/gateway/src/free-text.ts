/**
 * Texte libre sur USSD : « Neldu ujineere jowi ka Fadimatou », « What is my balance? ».
 *
 * Le menu numéroté reste la voie principale. Quand la saisie n'est pas un choix du menu, la
 * COMPRÉHENSION est déléguée au moteur (`@nkap/core`) — le même que le web, le mobile et la bulle —
 * et ce module ne fait que traduire son interprétation en point d'entrée du dialogue USSD.
 * Rien n'est deviné : un paramètre absent de la phrase reste absent, le dialogue le demandera.
 */

import { BILLERS, type IntentName } from '@nkap/contracts';
import { interpret } from '@nkap/core';
import { toSafinumIntent, type SafinumIntent } from '@nkap/safinum';
import type { GatewayLanguage } from './i18n.js';

export type FreeTextRoute =
  | { readonly kind: 'balance' | 'history' | 'help' | 'language' }
  | { readonly kind: 'fees'; readonly amount?: number }
  | { readonly kind: 'transfer'; readonly amount?: number; readonly recipient?: string; readonly phone?: string }
  | { readonly kind: 'airtime'; readonly amount?: number; readonly phone?: string }
  | { readonly kind: 'bill'; readonly amount?: number; readonly biller?: string; readonly reference?: string };

export interface Understood {
  readonly route: FreeTextRoute;
  readonly intent: SafinumIntent;
  /** Paramètres extraits, tels que le jury les verra dans `interpretation.parameters`. */
  readonly parameters: Readonly<Record<string, string | number>>;
}

/** Intentions sans parcours USSD (retrait, salutation…) : on renvoie le menu plutôt que d'improviser. */
const ROUTABLE: ReadonlySet<IntentName> = new Set([
  'CHECK_BALANCE',
  'TX_HISTORY',
  'HELP',
  'EXPLAIN_TERM',
  'CHANGE_LANGUAGE',
  'CHECK_FEES',
  'TRANSFER',
  'BUY_AIRTIME',
  'PAY_BILL',
]);

export function understandFreeText(text: string, language: GatewayLanguage): Understood | null {
  const interpretation = interpret(text, { hintLang: language, knownNames: [] });
  if (!ROUTABLE.has(interpretation.intent)) return null;

  const { amount, recipientQuery, phone, biller, billReference } = interpretation.slots;
  const value = amount?.amount;
  const parameters: Record<string, string | number> = {};
  if (value !== undefined) Object.assign(parameters, { amount: value, currency: 'XAF' });
  if (recipientQuery !== undefined) parameters.beneficiary = recipientQuery;
  if (phone !== undefined) parameters.beneficiary_phone = phone;
  if (biller !== undefined) parameters.biller = biller;
  if (billReference !== undefined) parameters.reference = billReference;

  const route = toRoute(interpretation.intent, { value, recipientQuery, phone, biller, billReference });
  return route === null ? null : { route, intent: toSafinumIntent(interpretation.intent), parameters };
}

function toRoute(
  intent: IntentName,
  slots: { value?: number; recipientQuery?: string; phone?: string; biller?: string; billReference?: string },
): FreeTextRoute | null {
  const amount = slots.value === undefined ? {} : { amount: slots.value };
  switch (intent) {
    case 'CHECK_BALANCE':
      return { kind: 'balance' };
    case 'TX_HISTORY':
      return { kind: 'history' };
    case 'HELP':
    case 'EXPLAIN_TERM':
      return { kind: 'help' };
    case 'CHANGE_LANGUAGE':
      return { kind: 'language' };
    case 'CHECK_FEES':
      return { kind: 'fees', ...amount };
    case 'TRANSFER':
      return {
        kind: 'transfer',
        ...amount,
        ...(slots.recipientQuery === undefined ? {} : { recipient: slots.recipientQuery }),
        ...(slots.phone === undefined ? {} : { phone: slots.phone }),
      };
    case 'BUY_AIRTIME':
      return { kind: 'airtime', ...amount, ...(slots.phone === undefined ? {} : { phone: slots.phone }) };
    case 'PAY_BILL':
      return {
        kind: 'bill',
        ...amount,
        ...(slots.biller !== undefined && (BILLERS as readonly string[]).includes(slots.biller) ? { biller: slots.biller } : {}),
        ...(slots.billReference === undefined ? {} : { reference: slots.billReference }),
      };
    default:
      return null;
  }
}
