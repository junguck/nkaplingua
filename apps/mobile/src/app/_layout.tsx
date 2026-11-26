import { t } from '@nkap/client';
import { createLocalRuntime, NkapProvider, useConversation, type NkapRuntime } from '@nkap/react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps, JSX } from 'react';
import type { ColorValue } from 'react-native';
import { BubbleBridge } from '@/bubble/BubbleBridge';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabIcon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }): JSX.Element => <Ionicons name={name} color={typeof color === 'string' ? color : colors.muted} size={size} />;

// Moteur embarqué : toute la compréhension tourne sur le téléphone, hors ligne.
const createMobileRuntime = (): NkapRuntime => createLocalRuntime('mobile', 'amina');

function AppTabs(): JSX.Element {
  const { lang } = useConversation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('ui.home', lang), headerShown: false, tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="assistant" options={{ title: t('ui.assistant', lang), tabBarIcon: tabIcon('chatbubbles-outline') }} />
      <Tabs.Screen name="bubble" options={{ title: t('ui.bubble', lang), tabBarIcon: tabIcon('radio-button-on-outline') }} />
    </Tabs>
  );
}

export default function RootLayout(): JSX.Element {
  return (
    <NkapProvider create={createMobileRuntime}>
      <StatusBar style="light" />
      <BubbleBridge />
      <AppTabs />
    </NkapProvider>
  );
}
