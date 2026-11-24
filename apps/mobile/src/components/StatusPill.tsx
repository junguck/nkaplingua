import { needsReviewBadge, statusLabel, t } from '@nkap/client';
import type { LanguageCode, TranslationStatus } from '@nkap/contracts';
import { Ionicons } from '@expo/vector-icons';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, statusColors } from '@/theme';

interface StatusPillProps {
  readonly status: TranslationStatus;
  readonly fallback: boolean;
  readonly lang: LanguageCode;
}

/** Honnêteté linguistique : statut visible, avec la raison en clair (pas d'infobulle sur mobile). */
export function StatusPill({ status, fallback, lang }: StatusPillProps): JSX.Element {
  const review = needsReviewBadge(status);
  const { bg, fg } = statusColors(status);
  const note = [review ? t('ui.unvalidated', lang) : null, fallback ? t('ui.fallback', lang) : null].filter((n): n is string => n !== null).join(' · ');
  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Ionicons name={review ? 'alert-circle-outline' : 'shield-checkmark-outline'} size={13} color={fg} />
        <Text style={[styles.label, { color: fg }]}>{statusLabel(status, lang)}</Text>
      </View>
      {note.length > 0 ? <Text style={styles.note} numberOfLines={2}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  label: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: 11, color: '#62706a', flexShrink: 1 },
});
