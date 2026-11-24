import { formatAmount, formatShortDate, quickActionInput, t, type QuickAction } from '@nkap/client';
import { useConversation, useNkap, useWallet } from '@nkap/react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageChips } from '@/components/LanguageChips';
import { QuickActionGrid } from '@/components/QuickActionGrid';
import { colors, radius } from '@/theme';

export default function HomeScreen(): JSX.Element {
  const router = useRouter();
  const { client, chat } = useNkap();
  const { account, history } = useWallet();
  const { lang, pending } = useConversation();

  // Les boutons ouvrent le MÊME dialogue que la phrase libre (confirmation, frais, plafonds).
  const runAction = (action: QuickAction, label: string): void => {
    void chat.sendIntent(quickActionInput(action), label);
    router.navigate('/assistant');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.heroTop}>
            <Text style={styles.institution}>{client.institutionName}</Text>
            <Text style={styles.holder}>{account?.holderName ?? '…'}</Text>
          </View>
          <LanguageChips />
          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>{t('ui.balance', lang)}</Text>
            <Text style={styles.balance}>{account ? formatAmount(account.balance.amount) : '— FCFA'}</Text>
            <Text style={styles.phone}>{account?.phone}</Text>
          </View>
        </SafeAreaView>
        <QuickActionGrid lang={lang} disabled={pending} onAction={runAction} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('ui.history', lang)}</Text>
        {history.length === 0 ? <Text style={styles.muted}>{t('ui.history.empty', lang)}</Text> : null}
        {history.map((tx, i) => {
          const incoming = tx.direction === 'in';
          return (
            <View key={tx.id} style={[styles.tx, i > 0 && styles.divider]}>
              <View style={[styles.txIcon, incoming && styles.txIconIn]}>
                <Ionicons name={incoming ? 'arrow-down' : 'arrow-up'} size={16} color={incoming ? colors.success : colors.primary} />
              </View>
              <View style={styles.txBody}>
                <Text style={styles.txName} numberOfLines={1}>
                  {tx.counterparty}
                </Text>
                <Text style={styles.muted}>
                  {t(incoming ? 'ui.in' : 'ui.out', lang)} · {formatShortDate(tx.at)}
                </Text>
              </View>
              <Text style={[styles.txAmount, incoming && styles.txAmountIn]}>
                {incoming ? '+' : '−'}
                {formatAmount(tx.amount.amount)}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.locked}>{t('ui.lockedValues', lang)}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  hero: { backgroundColor: colors.primary, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: 'hidden' },
  heroTop: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  institution: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  holder: { color: colors.onPrimary, fontSize: 18, fontWeight: '700' },
  balanceBlock: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  balance: { color: colors.onPrimary, fontSize: 38, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  phone: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  card: { margin: 16, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  txIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  txIconIn: { backgroundColor: '#dff3e8' },
  txBody: { flex: 1, minWidth: 0 },
  txName: { fontSize: 15, fontWeight: '600', color: colors.text },
  txAmount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  txAmountIn: { color: colors.success },
  muted: { fontSize: 12, color: colors.muted },
  locked: { textAlign: 'center', fontSize: 12, color: colors.muted },
});
