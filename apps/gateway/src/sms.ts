/**
 * SMS — canal v2, servi sur la même URL que les trois canaux du contrat.
 *
 * Un SMS n'est pas un menu USSD : chaque message est un tour complet, sans `*` de concaténation
 * et sans session de 180 s. On garde pourtant le même dialogue (le texte est une réponse au
 * menu : `1`, `2`…), parce que c'est ce que la sandbox attend d'un canal sans interface.
 *
 * Ce qui est réellement vérifié ici, et qui se voit dans la réponse :
 *   - l'encodage : GSM-7 par défaut, UCS-2 dès un seul caractère hors alphabet (ɛ, ɔ, ŋ, ɓ) ;
 *   - le découpage : 160 / 70 caractères pour un message seul, 153 / 67 par segment dès qu'il
 *     en faut plusieurs (les en-têtes de concaténation mangent 7 unités) ;
 *   - le nombre de segments, pour que le jury voie ce qui sera facturé.
 *
 * Limite assumée : le SMS ne comprend pas encore une phrase libre (« envoie 5000 à Awa ») ;
 * il attend un choix de menu. Le dire vaut mieux que le laisser croire.
 */

import type { InboundTurn, UssdReply } from '@nkap/safinum';
import { handleUssd, type UssdDeps } from './ussd.js';

export const SMS_MAX_SINGLE_GSM7 = 160;
export const SMS_MAX_SINGLE_UCS2 = 70;
export const SMS_MAX_SEGMENT_GSM7 = 153;
export const SMS_MAX_SEGMENT_UCS2 = 67;

/** Alphabet GSM-7 (03.38), extensions comprises. Tout le reste bascule le message en UCS-2. */
const GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

export interface SmsSegment {
  readonly encoding: 'gsm7' | 'ucs2';
  readonly length: number;
  readonly segments: number;
  readonly per_segment: number;
}

/** Découpage tel que l'opérateur le facture, pas tel qu'on l'espère. */
export function smsSegment(text: string): SmsSegment {
  const gsm7 = GSM7.test(text);
  const single = gsm7 ? SMS_MAX_SINGLE_GSM7 : SMS_MAX_SINGLE_UCS2;
  const per = gsm7 ? SMS_MAX_SEGMENT_GSM7 : SMS_MAX_SEGMENT_UCS2;
  const length = text.length;
  const segments = length <= single ? 1 : Math.ceil(length / per);
  return {
    encoding: gsm7 ? 'gsm7' : 'ucs2',
    length,
    segments,
    // Limite réellement appliquée : 160/70 pour un message seul, 153/67 dès qu'il est découpé.
    per_segment: segments === 1 ? single : per,
  };
}

export interface SmsReply {
  readonly channel: 'sms';
  readonly response: UssdReply['response'];
  readonly interpretation: UssdReply['interpretation'];
  readonly transaction: UssdReply['transaction'];
  readonly sms: SmsSegment;
}

export async function handleSms(turn: InboundTurn, deps: UssdDeps): Promise<SmsReply> {
  const reply = await handleUssd({ ...turn, channel: 'sms' }, deps);
  return {
    channel: 'sms',
    response: reply.response,
    interpretation: reply.interpretation,
    transaction: reply.transaction,
    sms: smsSegment(reply.response.text),
  };
}
