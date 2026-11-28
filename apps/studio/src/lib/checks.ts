/**
 * Contrôles d'une proposition, identiques côté navigateur (aperçu en direct) et côté serveur
 * (refus définitif). Une seule implémentation : aucune divergence possible.
 */
import { NATIONAL_RULES, LATIN_RULES, foldToGsm7, placeholderSignature, ussdBudget, type Language } from '@nkap/lingua-core';

export interface ProposalChecks {
  readonly placeholdersOk: boolean;
  readonly expectedPlaceholders: string;
  readonly lengthOk: boolean;
  readonly length: number;
  readonly maxChars: number | null;
  readonly ussdPreview: string;
  readonly ussdSeptets: number;
  readonly ussdFits: boolean;
  readonly identicalToSource: boolean;
}

export function checkProposal(source: string, proposal: string, lang: Language, maxChars: number | null): ProposalChecks {
  const text = proposal.trim();
  const preview = foldToGsm7(text, lang === 'fr' || lang === 'en' ? LATIN_RULES : NATIONAL_RULES);
  const budget = ussdBudget(preview);
  const length = [...text].length;
  return {
    placeholdersOk: placeholderSignature(source) === placeholderSignature(text),
    expectedPlaceholders: placeholderSignature(source),
    lengthOk: maxChars === null || length <= maxChars,
    length,
    maxChars,
    ussdPreview: preview,
    ussdSeptets: budget.length,
    ussdFits: budget.fits,
    identicalToSource: text.toLowerCase() === source.trim().toLowerCase(),
  };
}

export function blockingIssues(checks: ProposalChecks): string[] {
  const issues: string[] = [];
  if (!checks.placeholdersOk) issues.push(`Emplacements attendus : ${checks.expectedPlaceholders || 'aucun'}`);
  if (!checks.lengthOk) issues.push(`${checks.length} caractères pour ${checks.maxChars} autorisés`);
  if (!checks.ussdFits) issues.push(`USSD : ${checks.ussdSeptets} septets pour 182`);
  return issues;
}

export const LANGUAGE_LABELS: Readonly<Record<Language, string>> = {
  fr: 'Français', en: 'English', dua: 'Duálá', ewo: 'Ewondo', bas: 'Ɓasaá', bbj: 'Ghɔmálá', byv: 'Mə̀dûmbà',
  fub: 'Fulfulde', hau: 'Hausa', bum: 'Bulu', wes: 'Kamtok', ybb: 'Yɛmba',
};
