import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useColorScheme, Platform, ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { darkColors, lightColors } from '@theme/colors';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { useThemeStore } from '@store/useThemeStore';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// expo-router passes color as ColorValue; Ionicons accepts string — cast is safe
// since our theme always uses hex strings, never platform colors.
function tabIcon(focused: boolean, active: IoniconName, inactive: IoniconName) {
  return ({ color }: { color: string | ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={26} color={color as string} />
  );
}

export default function TabsLayout() {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useColorScheme();
  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const { status } = usePortfolioStore();
  const insets = useSafeAreaInsets();
  // insets.bottom correctly returns the nav-bar height in edge-to-edge mode
  // (confirmed 44dp on Realme GT 6T). Floor at 20dp as a safety net for
  // devices where the context hasn't populated yet on the first render.
  const androidBottom = Platform.OS === 'android' ? Math.max(insets.bottom, 20) : 0;

  if (status === 'idle') {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 90 : 70 + androidBottom,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 30 : androidBottom + 20,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'grid', 'grid-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'briefcase', 'briefcase-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'receipt', 'receipt-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'pulse', 'pulse-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'map', 'map-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'settings', 'settings-outline')({ color }),
        }}
      />
    </Tabs>
  );
}
