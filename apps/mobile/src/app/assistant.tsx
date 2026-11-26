import { t } from '@nkap/client';
import { useConversation, useNkap } from '@nkap/react';
import { useEffect, useRef, type JSX } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { ChatBubble } from '@/components/ChatBubble';
import { Composer } from '@/components/Composer';
import { colors, radius } from '@/theme';

const SUGGESTIONS = ['Neldu ujineere jowi ka Fadimatou', 'Abeg sen faiv tausand give Maman', 'Envoie 2000 à Paul', 'What is my balance?'];

export default function AssistantScreen(): JSX.Element {
  const { chat } = useNkap();
  const { messages, pending, lang, error } = useConversation();
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.offline}>{t('ui.offline', lang)}</Text>
        {messages.length === 0 ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeText}>{t('ui.welcome', lang)}</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => void chat.sayText(s)} style={styles.suggestion}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <ChatBubble key={m.id} message={m} isLast={i === messages.length - 1} pending={pending} />
        ))}
        {pending ? <Text style={styles.offline}>…</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <Composer />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  offline: { textAlign: 'center', fontSize: 12, color: colors.muted },
  welcome: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: 14, gap: 10 },
  welcomeText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  suggestionText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13 },
});
