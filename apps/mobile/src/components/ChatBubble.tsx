import { operationCardRows, t, type ChatMessage } from '@nkap/client';
import { LANGUAGE_INFO, type ReplyOption } from '@nkap/contracts';
import { useNkap } from '@nkap/react';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import type { JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';
import { StatusPill } from './StatusPill';
import { ValueRows } from './ValueRows';

type OptionTone = 'primary' | 'outline' | 'soft';

function toneOf(option: ReplyOption): OptionTone {
  if (option.input.kind !== 'intent') return 'soft';
  if (option.input.intent === 'CONFIRM') return 'primary';
  return option.input.intent === 'CANCEL' ? 'outline' : 'soft';
}

interface ChatBubbleProps {
  readonly message: ChatMessage;
  /** Seuls les boutons du dernier message sont actifs : on ne confirme pas une fiche périmée. */
  readonly isLast: boolean;
  readonly pending: boolean;
}

export function ChatBubble({ message, isLast, pending }: ChatBubbleProps): JSX.Element {
  const { chat } = useNkap();

  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <Text style={styles.userText}>{message.text}</Text>
      </View>
    );
  }

  const { reply } = message;
  return (
    <View style={styles.botBubble}>
      {reply.parts.map((part, i) => (
        <Text key={i} style={[styles.botText, i === 0 && styles.first]}>
          {part}
        </Text>
      ))}
      {reply.card ? <ValueRows rows={operationCardRows(reply.card, reply.lang)} /> : null}
      {reply.options.length > 0 ? (
        <View style={styles.options}>
          {reply.options.map((option) => {
            const tone = toneOf(option);
            const disabled = !isLast || pending;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void chat.choose(option)}
                style={({ pressed }) => [styles.option, styles[tone], (pressed || disabled) && styles.dim]}
              >
                <Text style={[styles.optionText, tone === 'primary' && styles.optionTextPrimary]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.footer}>
        <StatusPill status={reply.status} fallback={reply.fallback} lang={reply.lang} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ui.listen', reply.lang)}
          hitSlop={10}
          onPress={() => Speech.speak(reply.text, { language: LANGUAGE_INFO[reply.lang].ttsLocale })}
        >
          <Ionicons name="volume-high-outline" size={20} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: colors.onPrimary, fontSize: 15 },
  botBubble: { alignSelf: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, borderBottomLeftRadius: 4, padding: 14 },
  botText: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 2 },
  first: { fontWeight: '600', marginTop: 0 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  option: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  outline: { backgroundColor: colors.surface, borderColor: colors.border },
  soft: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  dim: { opacity: 0.55 },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  optionTextPrimary: { color: colors.onPrimary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
});
