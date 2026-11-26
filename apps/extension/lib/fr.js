// Nombres et montants en français (le répondeur dit les montants en français tant
// qu'aucun fragment audio natif validé n'existe — aucun mot « franc » trouvé en fulfulde/ewondo).
const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n, final) {
  if (n < 17) return U[n];
  if (n < 20) return 'dix-' + U[n - 10];
  if (n < 70) { const t = Math.floor(n / 10), u = n % 10; return T[t] + (u === 1 ? ' et un' : u ? '-' + U[u] : ''); }
  if (n < 80) { const r = n - 60; return 'soixante' + (r === 11 ? ' et onze' : '-' + below100(r)); }
  const r = n - 80;
  return r === 0 ? (final ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' + below100(r, true);
}
function below1000(n, final) {
  const h = Math.floor(n / 100), r = n % 100;
  let s = '';
  if (h === 1) s = 'cent';
  else if (h > 1) s = U[h] + ' cent' + (r === 0 && final ? 's' : '');
  if (r) s += (s ? ' ' : '') + below100(r, final);
  return s;
}
export function numToFr(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return String(n);
  if (n === 0) return 'zéro';
  const parts = [];
  const m = Math.floor(n / 1_000_000), th = Math.floor((n % 1_000_000) / 1000), r = n % 1000;
  if (m) parts.push(m === 1 ? 'un million' : below1000(m, false) + ' millions');
  if (th) parts.push(th === 1 ? 'mille' : below1000(th, false) + ' mille');
  if (r) parts.push(below1000(r, true));
  return parts.join(' ');
}
export const fmtAmount = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ') + ' FCFA';
export const spokenAmount = (n) => numToFr(n) + (Number(n) > 1 ? ' francs CFA' : ' franc CFA');
export const digitsSpoken = (s) => String(s).replace(/\D/g, '').split('').map((d) => U[+d]).reduce((a, w, i) => a + (i && i % 2 === 0 ? ', ' : i ? ' ' : '') + w, '');
export const fmtPhone = (s) => { const d = String(s).replace(/\D/g, ''); return d.length === 9 ? `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : d; };
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
