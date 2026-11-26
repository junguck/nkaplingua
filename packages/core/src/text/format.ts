/**
 * Formatage déterministe : la même chaîne sur Node, Chrome, Hermes (React Native) et un
 * téléphone basique. On n'utilise pas Intl, dont le support varie selon le moteur et
 * qui insère des espaces insécables illisibles sur certains terminaux USSD.
 */
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.round(amount)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped} FCFA`;
}

/** 2026-11-24T10:00:00Z → 24/11 */
export function formatShortDate(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[2]}/${match[1]}` : iso;
}
