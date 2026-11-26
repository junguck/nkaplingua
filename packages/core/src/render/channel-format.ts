import type { ChannelProfile, Reply } from '@nkap/contracts';
import { gsm7Length, toGsm7, truncateGsm7 } from '../text/gsm7';

interface Measure {
  readonly encode: (text: string) => string;
  readonly length: (text: string) => number;
  readonly truncate: (text: string, budget: number) => string;
}

/** USSD/SMS : translittération GSM-7 et longueur en septets. Ailleurs : caractères Unicode. */
const GSM7: Measure = { encode: toGsm7, length: gsm7Length, truncate: truncateGsm7 };
const UTF8: Measure = { encode: (t) => t, length: (t) => [...t].length, truncate: truncateSafely };

/**
 * Met une réponse au format d'un canal texte contraint (USSD 182 septets, SMS 160).
 * Les choix numérotés sont prioritaires (sans eux, l'utilisateur USSD est bloqué),
 * puis les phrases dans l'ordre d'importance. On ne coupe jamais au milieu d'un nombre.
 */
export function formatForChannel(reply: Reply, profile: ChannelProfile): string {
  const m = profile.charset === 'gsm7' ? GSM7 : UTF8;
  const separator = profile.mode === 'menu' ? '\n' : ' ';
  const parts = reply.parts.map(m.encode);
  const optionLines = profile.numberedOptions ? reply.options.map((o) => `${o.key}. ${m.encode(o.label)}`) : [];
  const optionsBlock = optionLines.join('\n');

  if (profile.maxChars === null) {
    return [parts.join(separator), optionsBlock].filter((s) => s.length > 0).join('\n');
  }

  const budget = profile.maxChars - (optionsBlock.length > 0 ? m.length(optionsBlock) + 1 : 0);
  let body = '';
  for (const part of parts) {
    const candidate = body.length === 0 ? part : `${body}${separator}${part}`;
    if (m.length(candidate) <= budget) {
      body = candidate;
    } else {
      if (body.length === 0) body = m.truncate(part, budget);
      break;
    }
  }
  return [body, optionsBlock].filter((s) => s.length > 0).join('\n');
}

function truncateSafely(text: string, budget: number): string {
  if ([...text].length <= budget) return text;
  let cut = text.lastIndexOf(' ', Math.max(0, budget - 1));
  // Recule tant que la coupe tombe dans un montant (« 25 000 FCFA »).
  while (cut > 0 && /\d/.test(text.charAt(cut - 1)) && /\d/.test(text.charAt(cut + 1))) {
    cut = text.lastIndexOf(' ', cut - 1);
  }
  return cut > 0 ? `${text.slice(0, cut)}…` : text.slice(0, Math.max(0, budget - 1)) + '…';
}
