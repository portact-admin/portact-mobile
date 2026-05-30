import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { googleDriveService, WEB_CLIENT_ID, DRIVE_SCOPES } from '@services/googleDrive';
import { storage } from '@services/storage';
import { Typography } from '@components/ui/Typography';
import { formatCompact } from '@utils/formatters';

const BRAND_BG = '#0B1120';
const BRAND_BG2 = '#0F172A';
const DIVIDER = 'rgba(255,255,255,0.12)';

const MODULES = [
  {
    key: 'track',
    label: 'TRACK',
    color: '#4D94FF',
    bg: 'rgba(77,148,255,0.12)',
    description: 'Portfolio & Assets',
  },
  {
    key: 'plan',
    label: 'PLAN',
    color: '#A259FF',
    bg: 'rgba(162,89,255,0.12)',
    description: 'Financial Planning',
  },
  {
    key: 'retire',
    label: 'RETIRE',
    color: '#2ED882',
    bg: 'rgba(46,216,130,0.12)',
    description: 'Financial Freedom',
  },
];

async function checkDailySync(): Promise<void> {
  try {
    const lastSync = await storage.getLastSyncAt();
    if (!lastSync) return;
    const hoursSince = (Date.now() - new Date(lastSync).getTime()) / 3_600_000;
    if (hoursSince < 24) return;
    await GoogleSignin.signInSilently();
    const { content, file } = await googleDriveService.fetchLatestBackup();
    await usePortfolioStore.getState().loadFromString(content, {
      fileName: file.name,
      exportVersion: '',
      exportedAt: file.modifiedTime,
      loadedAt: new Date().toISOString(),
      source: 'google_drive',
    });
  } catch {
    // silent
  }
}

export default function AppSplash() {
  const router = useRouter();
  const loadFromStorage = usePortfolioStore((s) => s.loadFromStorage);
  const summary = usePortfolioStore((s) => s.summary);
  const nextRoute = useRef<'/(tabs)/' | '/onboarding' | null>(null);
  const [ready, setReady] = useState(false);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: DRIVE_SCOPES });

    loadFromStorage().finally(() => {
      // Defer state updates to the next tick so the navigation tree is fully
      // mounted before we update state or hide the native splash screen.
      setTimeout(() => {
        const { status } = usePortfolioStore.getState();
        const loaded = status === 'loaded';
        nextRoute.current = loaded ? '/(tabs)/' : '/onboarding';
        setHasData(loaded);
        setReady(true);
        SplashScreen.hideAsync();
      }, 0);
    });
  }, []);

  function handleTap() {
    if (!nextRoute.current) return;
    if (nextRoute.current === '/(tabs)/') {
      checkDailySync();
      // Start 30-min price refresh interval
      const interval = setInterval(() => {
        usePortfolioStore.getState().refreshLivePrices();
      }, 30 * 60 * 1000);
      // Kick off first refresh immediately
      usePortfolioStore.getState().refreshLivePrices();
      // Store interval ref for cleanup (simplified — app lifecycle manages this)
      (global as Record<string, unknown>).__priceInterval = interval;
    }
    router.replace(nextRoute.current);
  }

  const netWorth = summary?.totalValue;

  return (
    <Pressable style={{ flex: 1, backgroundColor: BRAND_BG }} onPress={handleTap}>
      <LinearGradient
        colors={[BRAND_BG, BRAND_BG2]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(26,110,255,0.18)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      />

      {/* Hero */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}>
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 90, height: 90 }}
          resizeMode="contain"
        />
        <Typography variant="display" weight="800" color="#FFFFFF">PortAct</Typography>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Typography variant="callout" weight="700" color="#4D94FF">TRACK</Typography>
          <Typography variant="callout" color={DIVIDER}>·</Typography>
          <Typography variant="callout" weight="700" color="#A259FF">PLAN</Typography>
          <Typography variant="callout" color={DIVIDER}>·</Typography>
          <Typography variant="callout" weight="700" color="#2ED882">RETIRE</Typography>
        </View>

        {/* Net worth if data loaded */}
        {hasData && netWorth != null && (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Typography variant="caption" color="rgba(255,255,255,0.4)" weight="600">NET WORTH</Typography>
            <Typography variant="hero" weight="800" color="#FFFFFF">{formatCompact(netWorth)}</Typography>
          </View>
        )}

        {/* Module cards */}
        {hasData && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' }}>
            {MODULES.map((m) => (
              <View
                key={m.key}
                style={{
                  flex: 1,
                  backgroundColor: m.bg,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: `${m.color}30`,
                  padding: 12,
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Typography variant="footnote" weight="800" color={m.color}>{m.label}</Typography>
                <Typography variant="micro" color="rgba(255,255,255,0.5)" align="center">{m.description}</Typography>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer hint */}
      <View style={{ paddingBottom: 48, alignItems: 'center' }}>
        <Typography
          variant="caption"
          color={ready ? 'rgba(255,255,255,0.35)' : 'transparent'}
        >
          Tap anywhere to continue
        </Typography>
      </View>
    </Pressable>
  );
}
