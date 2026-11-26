import { QUICK_ACTIONS, quickActionLabel, type QuickAction, type QuickActionId } from '@nkap/client';
import type { LanguageCode } from '@nkap/contracts';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Readonly<Record<QuickActionId, IconName>> = {
  balance: 'wallet-outline',
  send: 'paper-plane-outline',
  withdraw: 'cash-outline',
  airtime: 'phone-portrait-outline',
  bill: 'receipt-outline',
  history: 'time-outline',
  fees: 'calculator-outline',
};

interface QuickActionGridProps {
  readonly lang: LanguageCode;
  readonly disabled: boolean;
  readonly onAction: (action: QuickAction, label: string) => void;
}

export function QuickActionGrid({ lang, disabled, onAction }: QuickActionGridProps): JSX.Element {
  return (
    <View style={styles.grid}>
      {QUICK_ACTIONS.map((action) => {
        const label = quickActionLabel(action, lang).text;
        return (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onAction(action, label)}
            style={({ pressed }) => [styles.item, (pressed || disabled) && styles.pressed]}
          >
            <View style={styles.icon}>
              <Ionicons name={ICONS[action.id]} size={22} color={colors.onPrimary} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: 'rgba(0,0,0,0.12)', paddingVertical: 8, paddingHorizontal: 4 },
  item: { width: '25%', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2, gap: 6 },
  pressed: { opacity: 0.6 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.onPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
});
