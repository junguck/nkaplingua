import type { Contact, IntentSlots } from '@nkap/contracts';
import { fold, tokenize } from '../text/normalize';
import { formatAmount } from '../text/format';

export interface Correction {
  readonly slot: 'amount' | 'recipient';
  readonly from: string;
  readonly to: string;
}

export interface MergeResult {
  readonly slots: IntentSlots;
  readonly corrections: readonly Correction[];
  /** Le bénéficiaire a changé : la résolution dans le carnet est à refaire. */
  readonly recipientChanged: boolean;
}

/** Fusionne les nouvelles valeurs dans une opération en cours, en notant ce qui a été corrigé. */
export function mergeSlots(base: IntentSlots, update: IntentSlots, resolvedRecipientName: string | null): MergeResult {
  const slots: IntentSlots = { ...base };
  const corrections: Correction[] = [];

  if (update.amount !== undefined) {
    if (base.amount !== undefined && base.amount.amount !== update.amount.amount) {
      corrections.push({ slot: 'amount', from: formatAmount(base.amount.amount), to: formatAmount(update.amount.amount) });
    }
    slots.amount = update.amount;
  }

  const newPhone = update.phone !== undefined && update.phone !== base.phone;
  const newName = update.recipientQuery !== undefined && update.recipientQuery !== base.recipientQuery;
  if (newPhone || newName) {
    if (newName) slots.recipientQuery = update.recipientQuery;
    // Un nouveau nom sans numéro invalide l'ancien numéro.
    if (update.phone !== undefined) slots.phone = update.phone;
    else if (newName) delete slots.phone;
  }

  if (update.biller !== undefined) slots.biller = update.biller;
  if (update.billReference !== undefined) slots.billReference = update.billReference;

  const recipientChanged = newPhone || newName;
  if (recipientChanged && resolvedRecipientName !== null) {
    corrections.push({ slot: 'recipient', from: resolvedRecipientName, to: update.recipientQuery ?? update.phone ?? '' });
  }
  return { slots, corrections, recipientChanged };
}

export function hasOperationValues(slots: IntentSlots): boolean {
  return (
    slots.amount !== undefined ||
    slots.phone !== undefined ||
    slots.recipientQuery !== undefined ||
    slots.biller !== undefined ||
    slots.billReference !== undefined
  );
}

/** « paul » → tous les Paul ; « paul ndi » → Paul Ndi seulement. */
export function matchContacts(contacts: readonly Contact[], query: string): Contact[] {
  const wanted = tokenize(fold(query));
  if (wanted.length === 0) return [];
  return contacts.filter((c) => {
    const nameTokens = tokenize(fold(c.name));
    return wanted.every((t) => nameTokens.includes(t));
  });
}

export function capitalize(word: string): string {
  return word.replace(/(^|\s)(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}
