import { describe, expect, it } from 'vitest';
import { SMS_MAX_SEGMENT_GSM7, smsSegment } from '../src/sms.js';

describe('canal SMS — découpage facturé', () => {
  it('un message court reste en GSM-7 sur un segment', () => {
    const s = smsSegment('Votre solde est de 681 145 FCFA.');
    expect(s.encoding).toBe('gsm7');
    expect(s.segments).toBe(1);
  });

  it('161 caractères GSM-7 tiennent sur 2 segments de 153', () => {
    expect(smsSegment('a'.repeat(160)).segments).toBe(1);
    expect(smsSegment('a'.repeat(161)).segments).toBe(2);
    expect(smsSegment('a'.repeat(161)).per_segment).toBe(SMS_MAX_SEGMENT_GSM7);
  });

  it('un seul caractère hors GSM-7 bascule tout le message en UCS-2 (70 / 67)', () => {
    const s = smsSegment("Ceede ɓii");
    expect(s.encoding).toBe('ucs2');
    expect(s.per_segment).toBe(70);
    expect(smsSegment('ɓ'.repeat(71)).segments).toBe(2);
  });

  it('les caractères accentués du français restent GSM-7', () => {
    expect(smsSegment('Opération envoyée à Awa').encoding).toBe('gsm7');
  });
});
