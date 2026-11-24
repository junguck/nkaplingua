import { bubbleCardFor, t, type UiTextKey } from '@nkap/client';
import type { LanguageCode } from '@nkap/contracts';
import { useConversation } from '@nkap/react';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type JSX } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NkapBubble } from 'nkap-bubble';
import { useBubbleSetup } from '@/bubble/useBubbleSetup';
import { ScreenCardView } from '@/components/ScreenCardView';
import { colors, radius } from '@/theme';

/** Écrans d'exemple, tels que le service d'accessibilité les restitue (une ligne par nœud). */
const SAMPLES: readonly (readonly string[])[] = [
  ['Confirmer le transfert', 'Bénéficiaire', 'Paul Ndi (690000001)', 'Montant : 25 000 FCFA', 'Frais : 150 FCFA', 'Total à débiter', '25 150 FCFA', 'Confirmer', 'Annuler'],
  ["Bonjour, je vous ai envoyé par erreur 15 000 FCFA. Renvoyez l'argent et envoyez-moi le code reçu par SMS, c'est urgent."],
];

export default function BubbleScreen(): JSX.Element {
  const { lang } = useConversation();
  const setup = useBubbleSetup();
  const [sample, setSample] = useState(0);
  const preview = useMemo(() => bubbleCardFor({ status: 'ok', packageName: null, lines: SAMPLES[sample] ?? [] }, lang), [sample, lang]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('ui.bubble.title', lang)}</Text>
      <Text style={styles.pitch}>{t('ui.bubble.pitch', lang)}</Text>

      {setup.supported ? (
        <View style={styles.card}>
          <Step lang={lang} label="ui.bubble.overlay" done={setup.overlay} onGrant={() => NkapBubble?.openOverlaySettings()} />
          <Step lang={lang} label="ui.bubble.accessibility" done={setup.accessibility} onGrant={() => NkapBubble?.openAccessibilitySettings()} />
          <Pressable
            accessibilityRole="button"
            disabled={!setup.overlay}
            onPress={setup.toggle}
            style={[styles.primary, setup.running && styles.stop, !setup.overlay && styles.dim]}
          >
            <Ionicons name={setup.running ? 'stop-circle-outline' : 'play-circle-outline'} size={20} color={colors.onPrimary} />
            <Text style={styles.primaryText}>{t(setup.running ? 'ui.bubble.stop' : 'ui.bubble.start', lang)}</Text>
          </Pressable>
          {setup.error !== null ? <Text style={styles.error}>{setup.error}</Text> : null}
          <Text style={styles.subtitle}>{t('ui.bubble.allowed', lang)}</Text>
          {setup.allowed.map((p) => (
            <Text key={p} style={styles.mono}>
              {p}
            </Text>
          ))}
        </View>
      ) : (
        <View style={[styles.card, styles.notice]}>
          <Ionicons name="logo-android" size={18} color={colors.onAccent} />
          <Text style={styles.noticeText}>{t('ui.bubble.unsupported', lang)}</Text>
        </View>
      )}

      <View style={styles.privacy}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
        <Text style={styles.privacyText}>{t('ui.bubble.privacy', lang)}</Text>
      </View>

      <View style={styles.tryRow}>
        <Text style={styles.subtitle}>{t('ui.bubble.try', lang)}</Text>
        <View style={styles.tabs}>
          {SAMPLES.map((_, i) => (
            <Pressable key={i} accessibilityRole="button" onPress={() => setSample(i)} style={[styles.tab, i === sample && styles.tabActive]}>
              <Ionicons name={i === 0 ? 'swap-horizontal' : 'warning-outline'} size={16} color={i === sample ? colors.onPrimary : colors.primary} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.sampleScreen}>
        {(SAMPLES[sample] ?? []).map((line, i) => (
          <Text key={i} style={styles.sampleLine}>
            {line}
          </Text>
        ))}
      </View>
      <ScreenCardView card={preview} />
    </ScrollView>
  );
}

interface StepProps {
  readonly lang: LanguageCode;
  readonly label: UiTextKey;
  readonly done: boolean;
  readonly onGrant: () => void;
}

function Step({ lang, label, done, onGrant }: StepProps): JSX.Element {
  return (
    <View style={styles.step}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? colors.success : colors.muted} />
      <Text style={styles.stepLabel}>{t(label, lang)}</Text>
      {done ? (
        <Text style={styles.granted}>{t('ui.granted', lang)}</Text>
      ) : (
        <Pressable accessibilityRole="button" onPress={onGrant} style={styles.grant}>
          <Text style={styles.grantText}>{t('ui.grant', lang)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  pitch: { fontSize: 14, lineHeight: 20, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { flex: 1, fontSize: 15, color: colors.text },
  granted: { fontSize: 13, color: colors.success, fontWeight: '600' },
  grant: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  grantText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 12, marginTop: 4 },
  stop: { backgroundColor: colors.danger },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13 },
  subtitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.muted },
  notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.accent },
  noticeText: { flex: 1, color: colors.onAccent, fontSize: 14 },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.muted },
  tryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  tabActive: { backgroundColor: colors.primary },
  sampleScreen: { backgroundColor: '#eef1f0', borderRadius: radius.md, padding: 12, gap: 2 },
  sampleLine: { fontSize: 13, color: '#4a5550' },
});
