import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// Large backup JSON is stored as a plain file — AsyncStorage (SQLite) cannot
// handle multi-MB strings reliably on Android.
const DOC_DIR = FileSystem.documentDirectory ?? `${FileSystem.cacheDirectory}docs/`;
const BACKUP_FILE = `${DOC_DIR}portact_backup.json`;

const KEYS = {
  BACKUP_META: 'portact:backup_meta',
  GOOGLE_DRIVE_FILE_ID: 'portact:gdrive_file_id',
  GOOGLE_DRIVE_FOLDER_ID: 'portact:gdrive_folder_id',
  GOOGLE_WEB_CLIENT_ID: 'portact:google_web_client_id',
  LAST_SYNC_AT: 'portact:last_sync_at',
  ONBOARDING_DONE: 'portact:onboarding_done',
} as const;

export interface BackupMeta {
  fileName: string;
  exportVersion: string;
  exportedAt: string;
  loadedAt: string;
  source: 'manual' | 'google_drive';
}

async function set(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

async function get(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export const storage = {
  async saveBackup(json: string, meta: BackupMeta): Promise<void> {
    await Promise.all([
      FileSystem.writeAsStringAsync(BACKUP_FILE, json, { encoding: FileSystem.EncodingType.UTF8 }),
      set(KEYS.BACKUP_META, JSON.stringify(meta)),
      set(KEYS.LAST_SYNC_AT, new Date().toISOString()),
    ]);
  },

  async loadBackupJson(): Promise<string | null> {
    const info = await FileSystem.getInfoAsync(BACKUP_FILE);
    if (!info.exists) return null;
    return FileSystem.readAsStringAsync(BACKUP_FILE, { encoding: FileSystem.EncodingType.UTF8 });
  },

  async loadBackupMeta(): Promise<BackupMeta | null> {
    const raw = await get(KEYS.BACKUP_META);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BackupMeta;
    } catch {
      return null;
    }
  },

  async saveGoogleDriveConfig(fileId: string, folderId: string): Promise<void> {
    await Promise.all([
      set(KEYS.GOOGLE_DRIVE_FILE_ID, fileId),
      set(KEYS.GOOGLE_DRIVE_FOLDER_ID, folderId),
    ]);
  },

  async loadGoogleDriveConfig(): Promise<{ fileId: string; folderId: string } | null> {
    const [fileId, folderId] = await Promise.all([
      get(KEYS.GOOGLE_DRIVE_FILE_ID),
      get(KEYS.GOOGLE_DRIVE_FOLDER_ID),
    ]);
    if (!fileId) return null;
    return { fileId, folderId: folderId ?? '' };
  },

  async getLastSyncAt(): Promise<string | null> {
    return get(KEYS.LAST_SYNC_AT);
  },

  async markOnboardingDone(): Promise<void> {
    await set(KEYS.ONBOARDING_DONE, '1');
  },

  async isOnboardingDone(): Promise<boolean> {
    const val = await get(KEYS.ONBOARDING_DONE);
    return val === '1';
  },

  async saveGoogleWebClientId(id: string): Promise<void> {
    await set(KEYS.GOOGLE_WEB_CLIENT_ID, id);
  },

  async loadGoogleWebClientId(): Promise<string> {
    return (await get(KEYS.GOOGLE_WEB_CLIENT_ID)) ?? '';
  },

  userBackupPath(driveFileId: string): string {
    return `${DOC_DIR}portact_user_${driveFileId}.json`;
  },

  async saveUserBackup(driveFileId: string, json: string, meta: BackupMeta): Promise<void> {
    const path = this.userBackupPath(driveFileId);
    await Promise.all([
      FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 }),
      set(`portact:user_meta_${driveFileId}`, JSON.stringify(meta)),
    ]);
  },

  async loadUserBackup(driveFileId: string): Promise<{ json: string; meta: BackupMeta } | null> {
    const path = this.userBackupPath(driveFileId);
    const [info, rawMeta] = await Promise.all([
      FileSystem.getInfoAsync(path),
      get(`portact:user_meta_${driveFileId}`),
    ]);
    if (!info.exists || !rawMeta) return null;
    try {
      const json = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      return { json, meta: JSON.parse(rawMeta) as BackupMeta };
    } catch {
      return null;
    }
  },

  async clearAll(): Promise<void> {
    // Collect all per-user meta keys from AsyncStorage so we can delete those cache files too.
    const allKeys = await AsyncStorage.getAllKeys();
    const userMetaKeys = allKeys.filter((k) => k.startsWith('portact:user_meta_'));
    const userFileIds = userMetaKeys.map((k) => k.replace('portact:user_meta_', ''));

    await Promise.all([
      AsyncStorage.multiRemove(Object.values(KEYS)),
      AsyncStorage.multiRemove(userMetaKeys),
      FileSystem.deleteAsync(BACKUP_FILE, { idempotent: true }),
      ...userFileIds.map((id) =>
        FileSystem.deleteAsync(this.userBackupPath(id), { idempotent: true }),
      ),
    ]);
  },
};
