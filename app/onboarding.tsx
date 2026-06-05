import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Alert,
  StyleSheet,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { googleDriveService, GoogleDriveError } from '@services/googleDrive';
import { storage } from '@services/storage';
import { BackupParseError } from '@services/backupParser';
import { Typography } from '@components/ui/Typography';
import { Button } from '@components/ui/Button';

const BRAND_BG = '#0B1120';
const BRAND_BG2 = '#0F172A';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const TEXT_DIMMER = 'rgba(255,255,255,0.30)';
const DIVIDER = 'rgba(255,255,255,0.12)';
const CARD_BG = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.12)';

export default function OnboardingScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const loadFromString = usePortfolioStore((s) => s.loadFromString);

  const [driveLoading, setDriveLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  async function handleGoogleDrive() {
    setDriveLoading(true);
    try {
      await googleDriveService.signIn();
      await storage.markOnboardingDone();
      // Navigate back to index so the profile picker logic runs
      // (handles 1 file auto-load and multi-profile picker correctly)
      router.replace('/');
    } catch (err) {
      const msg = err instanceof GoogleDriveError
        ? err.message
        : 'Could not connect to Google Drive. Please try again.';
      Alert.alert('Connection Error', msg);
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleManualUpload() {
    setUploadLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) throw new Error('No file selected.');
      const content = await FileSystem.readAsStringAsync(asset.uri);
      const now = new Date().toISOString();
      await loadFromString(content, {
        fileName: asset.name ?? 'backup.json',
        exportVersion: '',
        exportedAt: now,
        loadedAt: now,
        source: 'manual',
      });
      await storage.markOnboardingDone();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/(tabs)/' as any);
    } catch (err) {
      // Only show the message for domain errors we write ourselves.
      // Raw JS/system errors (ReferenceError, TypeError, etc.) must never reach the user.
      const msg = err instanceof BackupParseError
        ? err.message
        : 'Could not import the backup file. Please make sure you are using a valid PortAct backup.';
      setTimeout(() => Alert.alert('Import Failed', msg), 300);
    } finally {
      setUploadLoading(false);
    }
  }

  const contentWidth = isTablet ? 460 : '100%';

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_BG }}>
      <LinearGradient
        colors={[BRAND_BG, BRAND_BG2]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      {/* Blue ambient glow */}
      <LinearGradient
        colors={[`${colors.accent}30`, 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xxxl,
            paddingBottom: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <View style={{ alignItems: 'center', gap: spacing.lg, width: contentWidth }}>
            <Image
              source={require('../assets/logo.png')}
              style={{ width: 96, height: 96 }}
              resizeMode="contain"
            />

            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <Typography variant="display" weight="800" color="#FFFFFF">
                PortAct
              </Typography>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Typography variant="callout" weight="700" color={colors.accent}>TRACK</Typography>
                <Typography variant="callout" color={DIVIDER}>·</Typography>
                <Typography variant="callout" weight="700" color="#A259FF">PLAN</Typography>
                <Typography variant="callout" color={DIVIDER}>·</Typography>
                <Typography variant="callout" weight="700" color={colors.gain}>RETIRE</Typography>
              </View>
            </View>

            <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }}>
              <Typography variant="title3" weight="600" color="#FFFFFF" align="center">
                Your complete financial journey
              </Typography>
              <Typography variant="body" color={TEXT_DIM} align="center">
                Track your portfolio, plan with AI, and retire with confidence.
              </Typography>
            </View>
          </View>

          {/* ── Actions ── */}
          <View style={{ width: contentWidth, gap: spacing.md, marginTop: spacing.xxxl }}>

            {/* Primary: Google Drive */}
            <View
              style={{
                backgroundColor: CARD_BG,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                padding: spacing.lg,
                gap: spacing.md,
              }}
            >
              <View style={{ gap: spacing.xs }}>
                <Typography variant="headline" color="#FFFFFF">Get started with Google Drive</Typography>
                <Typography variant="body" color={TEXT_DIM}>
                  Sign in with Google to automatically load your latest PortAct backup. Your data stays on your device and syncs daily.
                </Typography>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {['Daily auto-sync', 'Stays on device', 'One tap'].map((tag) => (
                  <View
                    key={tag}
                    style={{
                      backgroundColor: `${colors.accent}20`,
                      borderRadius: radius.full,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                    }}
                  >
                    <Typography variant="micro" color={colors.accent} weight="600">{tag}</Typography>
                  </View>
                ))}
              </View>
              <Button
                label="Continue with Google"
                variant="primary"
                fullWidth
                loading={driveLoading}
                onPress={handleGoogleDrive}
              />
            </View>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, height: 1, backgroundColor: DIVIDER }} />
              <Typography variant="caption" color={TEXT_DIMMER} weight="600">OR</Typography>
              <View style={{ flex: 1, height: 1, backgroundColor: DIVIDER }} />
            </View>

            {/* Secondary: manual upload */}
            <Button
              label="Import backup file manually"
              variant="ghost"
              fullWidth
              loading={uploadLoading}
              onPress={handleManualUpload}
            />
          </View>

          {/* ── Footer ── */}
          <Typography
            variant="caption"
            color={TEXT_DIMMER}
            align="center"
            style={{ marginTop: spacing.xl, maxWidth: 300 }}
          >
            PortAct Mobile is read-only. Your data is never modified or uploaded.
          </Typography>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
