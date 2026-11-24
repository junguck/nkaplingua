import type { BubbleCardPayload } from '@nkap/client';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alertColors, colors, radius } from '@/theme';
import { ValueRows } from './ValueRows';

/** Aperçu dans l'app de la fiche que la bulle affiche par-dessus une autre application. */
export function ScreenCardView({ card }: { readonly card: BubbleCardPayload }): JSX.Element {
  const danger = card.alerts.filter((a) => a.level === 'danger');
  const others = card.alerts.filter((a) => a.level !== 'danger');
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{card.title}</Text>
      {danger.map((a, i) => (
        <Alert key={`d${i}`} level={a.level} text={a.text} />
      ))}
      <ValueRows rows={card.rows} />
      {others.map((a, i) => (
        <Alert key={`o${i}`} level={a.level} text={a.text} />
      ))}
      {card.footer.length > 0 ? <Text style={styles.footer}>{card.footer}</Text> : null}
    </View>
  );
}

function Alert({ level, text }: BubbleCardPayload['alerts'][number]): JSX.Element {
  const { bg, fg } = alertColors[level];
  return <Text style={[styles.alert, { backgroundColor: bg, color: fg }, level === 'danger' && styles.alertStrong]}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.primary },
  alert: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, fontSize: 14, overflow: 'hidden' },
  alertStrong: { fontWeight: '700' },
  footer: { marginTop: 10, fontSize: 12, color: colors.muted },
});
