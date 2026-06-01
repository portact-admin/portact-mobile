import React, { useEffect, useState } from 'react';
import { ScrollView, View, Alert, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { useThemeStore, ThemePreference } from '@store/useThemeStore';
import { useBiometricStore } from '@store/useBiometricStore';
import { googleDriveService, GoogleDriveError, DriveFile, WEB_CLIENT_ID } from '@services/googleDrive';
import { storage } from '@services/storage';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Divider } from '@components/ui/Divider';
import { LoadingSpinner } from '@components/ui/LoadingSpinner';
import { formatRelativeDate, formatDate } from '@utils/formatters';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function SettingRow({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
        opacity: pressed ? 0.7 : 1,
      })}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <Typography
        variant="callout"
        color={destructive ? colors.loss : colors.textPrimary}
        style={{ flex: 1 }}
      >
        {label}
      </Typography>
      {value ? (
        <Typography
          variant="callout"
          color={colors.textSecondary}
          style={{ flexShrink: 1, maxWidth: '58%', textAlign: 'right' }}
        >
          {value}
        </Typography>
      ) : onPress ? (
        <Typography variant="callout" color={colors.textTertiary}>›</Typography>
      ) : null}
    </Pressable>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light',  label: 'Light',  icon: 'sunny-outline' },
  { value: 'dark',   label: 'Dark',   icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { backupMeta, clearData, loadFromString, status } = usePortfolioStore();
  const { preference, setPreference } = useThemeStore();

  const { enabled: biometricEnabled, setEnabled: setBiometricEnabled } = useBiometricStore();

  const [driveUser, setDriveUser] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  useEffect(() => {
    googleDriveService.configure(WEB_CLIENT_ID);
    googleDriveService.getCurrentUser().then((user) => {
      if (user) setDriveUser(user.user.email);
    });
  }, []);

  async function handleConnectDrive() {
    setDriveLoading(true);
    try {
      const user = await googleDriveService.signIn();
      setDriveUser(user.user.email);
      const files = await googleDriveService.listBackupFiles();
      setDriveFiles(files);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleDisconnectDrive() {
    Alert.alert('Disconnect Google Drive', 'You will need to sign in again to sync from Drive.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await googleDriveService.signOut();
          setDriveUser(null);
          setDriveFiles([]);
        },
      },
    ]);
  }

  async function handleSyncLatest() {
    setSyncLoading(true);
    try {
      const { content, file } = await googleDriveService.fetchLatestBackup();
      await loadFromString(content, {
        fileName: file.name,
        exportVersion: '',
        exportedAt: file.modifiedTime,
        loadedAt: new Date().toISOString(),
        source: 'google_drive',
      });
      Alert.alert('Synced', `Loaded ${file.name}`);
    } catch (err) {
      Alert.alert('Sync Failed', (err as Error).message);
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleManualUpload() {
    setUploadLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) throw new Error('No file selected.');
      const content = await FileSystem.readAsStringAsync(asset.uri);
      await loadFromString(content, {
        fileName: asset.name ?? 'backup.json',
        exportVersion: '',
        exportedAt: new Date().toISOString(),
        loadedAt: new Date().toISOString(),
        source: 'manual',
      });
      Alert.alert('Imported', `Loaded ${asset.name}`);
    } catch (err) {
      Alert.alert('Import Failed', (err as Error).message);
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleBiometricToggle(val: boolean) {
    if (val) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Not Available',
          'No biometric authentication is set up on this device. Please enable fingerprint or face recognition in your device settings.',
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable biometric lock',
        disableDeviceFallback: false,
      });
      if (!result.success) return;
    }
    await setBiometricEnabled(val);
  }

  async function handleClearData() {
    Alert.alert(
      'Clear All Data',
      'This will remove the cached backup from this device. Your original data on Google Drive or your computer is unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearData();
            router.replace('/onboarding');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Typography variant="title2" weight="700" style={{ paddingTop: spacing.sm }}>
          Settings
        </Typography>

        {/* Backup info */}
        {backupMeta && (
          <Card style={{ gap: 0, padding: 0 }}>
            <View style={{ padding: spacing.md, gap: spacing.xs }}>
              <Typography variant="footnote" color={colors.textSecondary} weight="600">CURRENT DATA</Typography>
            </View>
            <Divider />
            <SettingRow label="File" value={backupMeta.fileName} />
            <Divider />
            <SettingRow
              label="Exported"
              value={formatDate(backupMeta.exportedAt, 'DD MMM YYYY, HH:mm')}
            />
            <Divider />
            <SettingRow
              label="Loaded"
              value={formatRelativeDate(backupMeta.loadedAt)}
            />
            <Divider />
            <SettingRow label="Source" value={backupMeta.source === 'google_drive' ? 'Google Drive' : 'Manual'} />
          </Card>
        )}

        {/* Google Drive */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Typography variant="headline">Google Drive</Typography>
            {driveUser ? (
              <Typography variant="body" color={colors.textSecondary}>
                Connected as {driveUser}
              </Typography>
            ) : (
              <Typography variant="body" color={colors.textSecondary}>
                Not connected
              </Typography>
            )}
          </View>
          {driveLoading ? (
            <LoadingSpinner size="small" />
          ) : driveUser ? (
            <View style={{ gap: spacing.sm }}>
              <Button
                label={syncLoading ? 'Syncing…' : 'Sync Latest Backup'}
                variant="primary"
                fullWidth
                loading={syncLoading}
                onPress={handleSyncLatest}
              />
              <Button
                label="Disconnect"
                variant="ghost"
                fullWidth
                onPress={handleDisconnectDrive}
              />
            </View>
          ) : (
            <Button
              label="Sign in with Google"
              variant="secondary"
              fullWidth
              onPress={handleConnectDrive}
            />
          )}

          {/* List available backups */}
          {driveFiles.length > 0 && (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Typography variant="caption" color={colors.textSecondary} weight="600">
                AVAILABLE BACKUPS
              </Typography>
              {driveFiles.slice(0, 5).map((f) => (
                <Pressable
                  key={f.id}
                  onPress={async () => {
                    setSyncLoading(true);
                    try {
                      const content = await googleDriveService.downloadFile(f.id);
                      await loadFromString(content, {
                        fileName: f.name,
                        exportVersion: '',
                        exportedAt: f.modifiedTime,
                        loadedAt: new Date().toISOString(),
                        source: 'google_drive',
                      });
                      Alert.alert('Loaded', f.name);
                    } catch (err) {
                      Alert.alert('Error', (err as Error).message);
                    } finally {
                      setSyncLoading(false);
                    }
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: spacing.sm,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Typography variant="footnote" numberOfLines={1} style={{ flex: 1 }}>
                    {f.name}
                  </Typography>
                  <Typography variant="caption" color={colors.textSecondary}>
                    {formatRelativeDate(f.modifiedTime)}
                  </Typography>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {/* Manual upload */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Typography variant="headline">Manual Import</Typography>
            <Typography variant="body" color={colors.textSecondary}>
              Load a PortAct backup JSON file from your device.
            </Typography>
          </View>
          <Button
            label="Choose File"
            variant="secondary"
            fullWidth
            loading={uploadLoading}
            onPress={handleManualUpload}
          />
        </Card>

        {/* Appearance */}
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ padding: spacing.md }}>
            <Typography variant="footnote" color={colors.textSecondary} weight="600">APPEARANCE</Typography>
          </View>
          <Divider />
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <Typography variant="callout">Theme</Typography>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {THEME_OPTIONS.map(({ value, label, icon }) => {
                const active = preference === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setPreference(value)}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={icon} size={18} color={active ? '#fff' : colors.textSecondary} />
                    <Typography variant="caption" weight="600" color={active ? '#fff' : colors.textSecondary}>
                      {label}
                    </Typography>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Security */}
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ padding: spacing.md }}>
            <Typography variant="footnote" color={colors.textSecondary} weight="600">SECURITY</Typography>
          </View>
          <Divider />
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            gap: spacing.sm,
          }}>
            <Ionicons name="finger-print" size={20} color={colors.textSecondary} />
            <Typography variant="callout" color={colors.textPrimary} style={{ flex: 1 }}>
              Biometric Lock
            </Typography>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Divider />
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
            <Typography variant="caption" color={colors.textTertiary}>
              Require fingerprint or face recognition each time the app is opened.
            </Typography>
          </View>
        </Card>

        {/* Data management */}
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ padding: spacing.md }}>
            <Typography variant="footnote" color={colors.textSecondary} weight="600">DATA</Typography>
          </View>
          <Divider />
          <SettingRow label="Clear Cached Data" destructive onPress={handleClearData} />
        </Card>

        {/* About */}
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ padding: spacing.md }}>
            <Typography variant="footnote" color={colors.textSecondary} weight="600">ABOUT</Typography>
          </View>
          <Divider />
          <SettingRow label="Version" value={APP_VERSION} />
          <Divider />
          <SettingRow label="Read-only Mode" value="Enabled" />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
