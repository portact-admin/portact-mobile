import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { useColorScheme, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { darkColors, lightColors } from '@theme/colors';
import { useThemeStore } from '@store/useThemeStore';
import { useBiometricStore } from '@store/useBiometricStore';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { BiometricLockScreen } from '@components/BiometricLockScreen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { preference, loadPreference } = useThemeStore();
  const { enabled, locked, loadPreference: loadBiometric, lock } = useBiometricStore();
  const systemScheme = useColorScheme();
  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Hide the native splash as soon as the root layout mounts.
    // Doing it here (not in a child screen) guarantees it always fires,
    // even if a child screen crashes or hangs before it can call hideAsync.
    SplashScreen.hideAsync();
    loadPreference();
    loadBiometric();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        if (enabled) lock();
        // Morning (6 AM IST) price refresh — runs once per day when the app
        // first comes to the foreground. No-op before 6 AM or if already done.
        usePortfolioStore.getState().maybeRunDailyRefresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [enabled, lock]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {locked && <BiometricLockScreen />}
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade_from_bottom',
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="asset/[id]"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="mf-rating/[id]"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="stock-rating/[id]"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
