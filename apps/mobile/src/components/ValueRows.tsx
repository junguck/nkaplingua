import type { ScreenCardRow } from '@nkap/client';
import { Ionicons } from '@expo/vector-icons';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

const EMPHASIS = new Set(['total', 'balance']);

/** Libellé traduit + valeur verrouillée. Partagé par la fiche d'opération et l'aperçu de la bulle. */
export function ValueRows({ rows }: { readonly rows: ReadonlyArray<Pick<ScreenCardRow, 'label' | 'value'> & { readonly field?: string }> }): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <View style={styles.box}>
      {rows.map((row, i) => (
        <View key={`${row.label}-${i}`} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={styles.label}>{row.label}</Text>
          <View style={styles.valueWrap}>
            <Text style={[styles.value, row.field !== undefined && EMPHASIS.has(row.field) && styles.strong]}>{row.value}</Text>
            <Ionicons name="lock-closed" size={11} color="#a3b0aa" accessibilityElementsHidden />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.background },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '800' },
});
