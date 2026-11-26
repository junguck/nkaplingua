import { SUPPORTED_LANGUAGES } from '@nkap/client';
import { LANGUAGE_INFO } from '@nkap/contracts';
import { useConversation, useNkap } from '@nkap/react';
import type { JSX } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, radius } from '@/theme';

/** Changer de langue = un tour du dialogue : l'opération en cours n'est pas perdue. */
export function LanguageChips(): JSX.Element {
  const { chat } = useNkap();
  const { lang, pending } = useConversation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {SUPPORTED_LANGUAGES.map((code) => {
        const active = code === lang;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            disabled={pending || active}
            onPress={() => void chat.switchLanguage(code, LANGUAGE_INFO[code].nativeName)}
            style={[styles.chip, active && styles.active]}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{LANGUAGE_INFO[code].nativeName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  active: { backgroundColor: colors.onPrimary, borderColor: colors.onPrimary },
  label: { color: colors.onPrimary, fontSize: 13, fontWeight: '600' },
  activeLabel: { color: colors.primary },
});
