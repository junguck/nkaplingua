import { t } from '@nkap/client';
import { useConversation, useNkap } from '@nkap/react';
import { Ionicons } from '@expo/vector-icons';
import { useState, type JSX } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius } from '@/theme';

/**
 * Saisie texte. Pas de micro sur mobile pour l'instant : aucune reconnaissance vocale fulfulde
 * n'existe sur Android, et l'anglais nigérian pour le pidgin passe par le web (J3).
 */
export function Composer(): JSX.Element {
  const { chat } = useNkap();
  const { lang, pending } = useConversation();
  const [text, setText] = useState('');
  const canSend = !pending && text.trim().length > 0;

  const send = (): void => {
    if (!canSend) return;
    const value = text;
    setText('');
    void chat.sayText(value);
  };

  return (
    <View style={styles.bar}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        placeholder={t('ui.placeholder', lang)}
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        style={styles.input}
        accessibilityLabel={t('ui.placeholder', lang)}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t('ui.send', lang)} disabled={!canSend} onPress={send} style={[styles.send, !canSend && styles.dim]}>
        <Ionicons name="send" size={18} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, fontSize: 15, color: colors.text, backgroundColor: colors.background },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.45 },
});
