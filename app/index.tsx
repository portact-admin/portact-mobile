import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { googleDriveService, extractUserName, WEB_CLIENT_ID, DRIVE_SCOPES, DriveFile } from '@services/googleDrive';
import { storage, BackupMeta } from '@services/storage';
import { Typography } from '@components/ui/Typography';
import { formatRelativeDate } from '@utils/formatters';

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
    const files = await googleDriveService.listBackupFiles();
    if (files.length === 0) return;

    const activeFileName = usePortfolioStore.getState().backupMeta?.fileName;

    for (const file of files) {
      const json = await googleDriveService.downloadFile(file.id);
      const meta = {
        fileName:      file.name,
        exportVersion: '',
        exportedAt:    file.modifiedTime,
        loadedAt:      new Date().toISOString(),
        source:        'google_drive' as const,
      };
      await storage.saveUserBackup(file.id, json, meta);
      if (file.name === activeFileName) {
        await usePortfolioStore.getState().loadFromString(json, meta);
      }
    }
  } catch {
    // silent — daily sync is best-effort
  }
}

let _priceInterval: ReturnType<typeof setInterval> | null = null;

function startPriceRefresh() {
  if (_priceInterval) return;
  usePortfolioStore.getState().refreshLivePrices();
  _priceInterval = setInterval(() => {
    usePortfolioStore.getState().refreshLivePrices();
  }, 30 * 60 * 1000);
}

export default function AppSplash() {
  const router = useRouter();
  const loadFromStorage = usePortfolioStore((s) => s.loadFromStorage);
  const summary         = usePortfolioStore((s) => s.summary);

  const nextRoute = useRef<string | null>(null);

  const [ready,          setReady]          = useState(false);
  const [hasData,        setHasData]        = useState(false);
  const [checkingDrive,  setCheckingDrive]  = useState(false);
  const [profiles,       setProfiles]       = useState<DriveProfile[]>([]);
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: DRIVE_SCOPES });

    (async () => {
      // Bound the local read so a stalled FileSystem/AsyncStorage call can never
      // leave the splash hanging forever (observed after long sessions / if the
      // backup file was left partial by a killed write). If it doesn't finish in
      // time we fall through — the Drive check below can still restore the data.
      await Promise.race([
        loadFromStorage(),
        new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
      ]);
      const localLoaded = usePortfolioStore.getState().status === 'loaded';
      if (localLoaded) setHasData(true);

      // If we already have local data, navigate immediately without touching Drive.
      // checkDailySync() (called after navigation) handles Drive sync in the background.
      // Skipping the Drive check here eliminates startup hangs after Android kills the
      // process: signInSilently() can block indefinitely with a stale/expired token,
      // and Doze mode can prevent the 10 s setTimeout from ever firing.
      if (localLoaded) {
        nextRoute.current = '/(tabs)/';
        setReady(true);
        return;
      }

      // No local data — check Drive to auto-load a single backup or show the picker.
      setCheckingDrive(true);
      try {
        const files = await Promise.race([
          (async () => {
            await GoogleSignin.signInSilently();
            return await googleDriveService.listBackupFiles();
          })(),
          new Promise<DriveFile[]>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 10_000),
          ),
        ]);

        if (files.length >= 2) {
          setProfiles(files.map((f) => ({ file: f, userName: extractUserName(f.name) })));
          nextRoute.current = '/onboarding';
        } else if (files.length === 1) {
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
          nextRoute.current = '/onboarding';
        }
      } catch {
        nextRoute.current = '/onboarding';
      } finally {
        setCheckingDrive(false);
        setReady(true);
      }
    })();
  }, []);

  // ── Auto-navigate as soon as loading is done ───────────────────────────────
  // Runs when `ready` flips to true. At that point React has already committed
  // the final `profiles` value (React 18 batching), so if profiles.length > 0
  // the picker renders and we skip auto-navigation until the user picks one.
  useEffect(() => {
    if (!ready || profiles.length > 0) return;
    const route = nextRoute.current ?? '/onboarding';
    if (route === '/(tabs)/') {
      checkDailySync();
      startPriceRefresh();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.replace(route as any);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleProfileSelect(profile: DriveProfile) {
    if (loadingProfile) return;
    setLoadingProfile(profile.file.id);
    try {
      let json: string;
      let meta: BackupMeta = {
        fileName:      profile.file.name,
        exportVersion: '',
        exportedAt:    profile.file.modifiedTime,
        loadedAt:      new Date().toISOString(),
        source:        'google_drive',
      };

      const cached = await storage.loadUserBackup(profile.file.id);
      if (cached) {
        json = cached.json;
        meta = { ...cached.meta, loadedAt: new Date().toISOString() };
      } else {
        json = await googleDriveService.downloadFile(profile.file.id);
        await storage.saveUserBackup(profile.file.id, json, meta);
      }

      await usePortfolioStore.getState().loadFromString(json, meta);
      setProfiles([]);
      checkDailySync();
      startPriceRefresh();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/(tabs)/' as any);
    } catch (err) {
      const { BackupParseError } = await import('@services/backupParser');
      const msg = err instanceof BackupParseError
        ? err.message
        : 'Could not load this profile. Please try again.';
      Alert.alert('Load Failed', msg);
    } finally {
      setLoadingProfile(null);
    }
  }

  const showPicker = ready && profiles.length > 0;

  // ── Profile picker ─────────────────────────────────────────────────────────
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
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: 'rgba(77,148,255,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Typography variant="title3" weight="700" color="#4D94FF">
                    {profile.userName.charAt(0).toUpperCase()}
                  </Typography>
                </View>

                <View style={{ flex: 1 }}>
                  <Typography variant="headline" weight="700" color="#FFFFFF">
                    {profile.userName}
                  </Typography>
                  <Typography variant="caption" color="rgba(255,255,255,0.4)">
                    Updated {formatRelativeDate(profile.file.modifiedTime)}
                  </Typography>
                </View>

                {isLoading
                  ? <ActivityIndicator color="#4D94FF" size="small" />
                  : <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                }
              </Pressable>
            );
          })}

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

  // ── Loading splash ─────────────────────────────────────────────────────────
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

      {/* Footer: spinner while Drive loads, nothing once ready */}
      <View style={{ paddingBottom: 48, alignItems: 'center' }}>
        {checkingDrive
          ? <ActivityIndicator color="rgba(77,148,255,0.5)" />
          : null
        }
      </View>
    </View>
  );
}
