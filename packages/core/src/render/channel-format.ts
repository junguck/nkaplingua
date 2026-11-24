import type { ChannelProfile, Reply } from '@nkap/contracts';

/**
 * Met une réponse au format d'un canal texte contraint (USSD 182 car., SMS 160 car.).
 * Les choix numérotés sont prioritaires (sans eux, l'utilisateur USSD est bloqué),
 * puis les phrases dans l'ordre d'importance. On ne coupe jamais au milieu d'un nombre.
 */
export function formatForChannel(reply: Reply, profile: ChannelProfile): string {
  const separator = profile.mode === 'menu' ? '\n' : ' ';
  const optionLines = profile.numberedOptions ? reply.options.map((o) => `${o.key}. ${o.label}`) : [];
  const optionsBlock = optionLines.join('\n');

  if (profile.maxChars === null) {
    return [reply.parts.join(separator), optionsBlock].filter((s) => s.length > 0).join('\n');
  }

  const budget = profile.maxChars - (optionsBlock.length > 0 ? optionsBlock.length + 1 : 0);
  let body = '';
  for (const part of reply.parts) {
    const candidate = body.length === 0 ? part : `${body}${separator}${part}`;
    if (candidate.length <= budget) {
      body = candidate;
    } else {
      if (body.length === 0) body = truncateSafely(part, budget);
      break;
    }
  }
  return [body, optionsBlock].filter((s) => s.length > 0).join('\n');
}

function truncateSafely(text: string, budget: number): string {
  if (text.length <= budget) return text;
  let cut = text.lastIndexOf(' ', Math.max(0, budget - 1));
  // Recule tant que la coupe tombe dans un montant (« 25 000 FCFA »).
  while (cut > 0 && /\d/.test(text.charAt(cut - 1)) && /\d/.test(text.charAt(cut + 1))) {
    cut = text.lastIndexOf(' ', cut - 1);
  }
  return cut > 0 ? `${text.slice(0, cut)}…` : text.slice(0, Math.max(0, budget - 1)) + '…';
}
