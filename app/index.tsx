import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { googleDriveService, extractUserName, WEB_CLIENT_ID, DRIVE_SCOPES, DriveFile } from '@services/googleDrive';
import { storage } from '@services/storage';
import { Typography } from '@components/ui/Typography';
import { formatCompact, formatRelativeDate } from '@utils/formatters';

const BRAND_BG  = '#0B1120';
const BRAND_BG2 = '#0F172A';
const DIVIDER   = 'rgba(255,255,255,0.12)';

const MODULES = [
  { key: 'track',  label: 'TRACK',  color: '#4D94FF', bg: 'rgba(77,148,255,0.12)',  description: 'Portfolio & Assets' },
  { key: 'plan',   label: 'PLAN',   color: '#A259FF', bg: 'rgba(162,89,255,0.12)',  description: 'Financial Planning' },
  { key: 'retire', label: 'RETIRE', color: '#2ED882', bg: 'rgba(46,216,130,0.12)', description: 'Financial Freedom' },
];

interface DriveProfile {
  file: DriveFile;
  userName: string;
}

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
    // silent — daily sync is best-effort
  }
}

function startPriceRefresh() {
  usePortfolioStore.getState().refreshLivePrices();
  const interval = setInterval(() => {
    usePortfolioStore.getState().refreshLivePrices();
  }, 30 * 60 * 1000);
  (global as Record<string, unknown>).__priceInterval = interval;
}

export default function AppSplash() {
  const router = useRouter();
  const loadFromStorage = usePortfolioStore((s) => s.loadFromStorage);
  const summary         = usePortfolioStore((s) => s.summary);

  const nextRoute = useRef<'/(tabs)/' | '/onboarding' | null>(null);

  // UI state
  const [ready,          setReady]          = useState(false);
  const [hasData,        setHasData]        = useState(false);
  const [checkingDrive,  setCheckingDrive]  = useState(false);
  const [profiles,       setProfiles]       = useState<DriveProfile[]>([]);
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null); // file id being loaded

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: DRIVE_SCOPES });

    (async () => {
      // ── Step 1: try local storage ──────────────────────────────────────
      await loadFromStorage();
      const { status } = usePortfolioStore.getState();

      if (status === 'loaded') {
        nextRoute.current = '/(tabs)/';
        setHasData(true);
        setReady(true);
        SplashScreen.hideAsync();
        return;
      }

      // ── Step 2: no local data — silently probe Google Drive ────────────
      setCheckingDrive(true);
      try {
        await GoogleSignin.signInSilently();
        const files = await googleDriveService.listBackupFiles();

        if (files.length === 0) {
          // Nothing on Drive → show onboarding
          nextRoute.current = '/onboarding';

        } else if (files.length === 1) {
          // Exactly one backup → auto-load
          const content = await googleDriveService.downloadFile(files[0].id);
          await usePortfolioStore.getState().loadFromString(content, {
            fileName:      files[0].name,
            exportVersion: '',
            exportedAt:    files[0].modifiedTime,
            loadedAt:      new Date().toISOString(),
            source:        'google_drive',
          });
          nextRoute.current = '/(tabs)/';
          setHasData(true);

        } else {
          // Multiple backups → show profile picker
          setProfiles(
            files.map((f) => ({ file: f, userName: extractUserName(f.name) })),
          );
          nextRoute.current = '/onboarding'; // fallback if user dismisses picker
        }
      } catch {
        // Not signed in or Drive unavailable → let onboarding handle it
        nextRoute.current = '/onboarding';
      } finally {
        setCheckingDrive(false);
        setReady(true);
        SplashScreen.hideAsync();
      }
    })();
  }, []);

  // Called when the user taps a profile card
  async function handleProfileSelect(profile: DriveProfile) {
    if (loadingProfile) return;
    setLoadingProfile(profile.file.id);
    try {
      const content = await googleDriveService.downloadFile(profile.file.id);
      await usePortfolioStore.getState().loadFromString(content, {
        fileName:      profile.file.name,
        exportVersion: '',
        exportedAt:    profile.file.modifiedTime,
        loadedAt:      new Date().toISOString(),
        source:        'google_drive',
      });
      setProfiles([]);
      setHasData(true);
      nextRoute.current = '/(tabs)/';
      checkDailySync();
      startPriceRefresh();
      router.replace('/(tabs)/');
    } catch {
      // let user retry
    } finally {
      setLoadingProfile(null);
    }
  }

  // Tap-anywhere handler (only active when NOT showing the profile picker)
  function handleTap() {
    if (!ready || profiles.length > 0) return;
    if (nextRoute.current === '/(tabs)/') {
      checkDailySync();
      startPriceRefresh();
    }
    router.replace(nextRoute.current ?? '/onboarding');
  }

  const netWorth = summary?.totalValue;
  const showPicker = ready && profiles.length > 0;

  // ── Profile picker ────────────────────────────────────────────────────────
  if (showPicker) {
    return (
      <View style={{ flex: 1, backgroundColor: BRAND_BG }}>
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

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Image
              source={require('../assets/logo.png')}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
            <Typography variant="title2" weight="800" color="#FFFFFF">
              Who's using PortAct?
            </Typography>
            <Typography variant="body" color="rgba(255,255,255,0.45)" align="center">
              Multiple backups found in your Google Drive.{'\n'}Select a profile to continue.
            </Typography>
          </View>

          {/* Profile cards */}
          {profiles.map((profile) => {
            const isLoading = loadingProfile === profile.file.id;
            return (
              <Pressable
                key={profile.file.id}
                onPress={() => handleProfileSelect(profile)}
                disabled={!!loadingProfile}
                style={({ pressed }) => ({
                  backgroundColor: pressed && !loadingProfile
                    ? 'rgba(77,148,255,0.18)'
                    : 'rgba(255,255,255,0.06)',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isLoading
                    ? 'rgba(77,148,255,0.6)'
                    : 'rgba(255,255,255,0.1)',
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                })}
              >
                {/* Avatar */}
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: 'rgba(77,148,255,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Typography variant="title3" weight="700" color="#4D94FF">
                    {profile.userName.charAt(0).toUpperCase()}
                  </Typography>
                </View>

                {/* Name + date */}
                <View style={{ flex: 1 }}>
                  <Typography variant="headline" weight="700" color="#FFFFFF">
                    {profile.userName}
                  </Typography>
                  <Typography variant="caption" color="rgba(255,255,255,0.4)">
                    Updated {formatRelativeDate(profile.file.modifiedTime)}
                  </Typography>
                </View>

                {/* Right icon */}
                {isLoading
                  ? <ActivityIndicator color="#4D94FF" size="small" />
                  : <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                }
              </Pressable>
            );
          })}

          {/* Manual import fallback */}
          <Pressable
            onPress={() => router.replace('/onboarding')}
            disabled={!!loadingProfile}
            style={{ alignItems: 'center', marginTop: 8 }}
          >
            <Typography variant="footnote" color="rgba(255,255,255,0.3)">
              Import a different file
            </Typography>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Normal splash ─────────────────────────────────────────────────────────
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

        {/* Checking Drive spinner */}
        {checkingDrive && (
          <View style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
            <ActivityIndicator color="rgba(77,148,255,0.7)" />
            <Typography variant="caption" color="rgba(255,255,255,0.3)">
              Checking Google Drive…
            </Typography>
          </View>
        )}

        {/* Net worth preview */}
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

      {/* Footer */}
      <View style={{ paddingBottom: 48, alignItems: 'center' }}>
        <Typography
          variant="caption"
          color={ready && !checkingDrive ? 'rgba(255,255,255,0.35)' : 'transparent'}
        >
          Tap anywhere to continue
        </Typography>
      </View>
    </Pressable>
  );
}
