import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { DailyBaseline, MfNavPoint } from '@models/portfolio';
import { stripAssetSnapshots } from './backupParser';

// Large backup JSON is stored as a plain file — AsyncStorage (SQLite) cannot
// handle multi-MB strings reliably on Android.
const DOC_DIR = FileSystem.documentDirectory ?? `${FileSystem.cacheDirectory}docs/`;
const BACKUP_FILE = `${DOC_DIR}portact_backup.json`;

// Hard ceiling on a backup file we'll attempt to read. Reading then JSON.parsing
// a file this large risks an out-of-memory crash that the JS engine can't catch
// (it kills/relaunches the process → the frozen-native-splash crash-loop). We
// can't predict OOM exactly — it depends on the device's free heap and parse
// peak (~2-10x the string size) — but file size is a reliable, cheap proxy, so
// we refuse to read beyond this and let the caller warn the user instead.
// After asset_snapshots slimming a real backup is a few MB at most; this is a
// last-resort safety net, not a normal code path.
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024; // 100 MB
const MB = 1024 * 1024;

const KEYS = {
  BACKUP_META: 'portact:backup_meta',
  GOOGLE_DRIVE_FILE_ID: 'portact:gdrive_file_id',
  GOOGLE_DRIVE_FOLDER_ID: 'portact:gdrive_folder_id',
  GOOGLE_WEB_CLIENT_ID: 'portact:google_web_client_id',
  LAST_SYNC_AT: 'portact:last_sync_at',
  ONBOARDING_DONE: 'portact:onboarding_done',
  DAILY_BASELINE: 'portact:daily_baseline',
  MF_NAV_HISTORY: 'portact:mf_nav_history',
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

// Write atomically: a process kill mid-write would otherwise leave the file
// truncated, which makes the next launch fail to parse (or stall) on startup.
// Write to a temp file first, then move it into place.
//
// The temp name is unique per call so two concurrent writers (e.g. the
// migration rewrite in loadBackupJson racing a saveBackup) can't clobber each
// other's temp file and make one of the moves fail. On any failure the temp is
// cleaned up so unique names don't accumulate as orphans.
async function writeFileAtomic(path: string, json: string): Promise<void> {
  const tmp = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await FileSystem.writeAsStringAsync(tmp, json, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: path });
  } catch (err) {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* best-effort cleanup */ });
    throw err;
  }
}

export const storage = {
  async saveBackup(json: string, meta: BackupMeta): Promise<void> {
    // Never persist the unbounded asset_snapshots arrays — over time they grow
    // large enough to freeze / OOM the JS thread on the next cold-start parse
    // (the frozen-native-splash hang). The app only uses snapshot-level totals.
    const slim = stripAssetSnapshots(json).json;
    await writeFileAtomic(BACKUP_FILE, slim);
    await Promise.all([
      set(KEYS.BACKUP_META, JSON.stringify(meta)),
      set(KEYS.LAST_SYNC_AT, new Date().toISOString()),
    ]);
  },

  /**
   * Size in bytes of the active backup file, or null if it doesn't exist / can't
   * be determined. Never throws — a failure here must not be able to block
   * startup; the caller treats null as "proceed normally".
   */
  async backupFileSize(): Promise<number | null> {
    try {
      const info = await FileSystem.getInfoAsync(BACKUP_FILE);
      return info.exists ? info.size : null;
    } catch {
      return null;
    }
  },

  async loadBackupJson(): Promise<string | null> {
    const info = await FileSystem.getInfoAsync(BACKUP_FILE);
    if (!info.exists) return null;
    // Refuse to read a file too large to parse safely (see MAX_BACKUP_BYTES).
    // Returning null routes the app to the "no local data" path (Drive
    // re-download) instead of risking an OOM crash-loop on every launch.
    if (info.size > MAX_BACKUP_BYTES) {
      console.warn(`[storage] backup is ${(info.size / MB).toFixed(0)} MB (> ${MAX_BACKUP_BYTES / MB} MB) — skipping read to avoid OOM.`);
      return null;
    }
    const raw = await FileSystem.readAsStringAsync(BACKUP_FILE, { encoding: FileSystem.EncodingType.UTF8 });
    // Recover a backup saved by an older build (still carrying asset_snapshots):
    // strip at the string level — cheap enough to rescue a file too big to
    // JSON.parse — and migrate it in place so future launches read the small file.
    const { json, changed } = stripAssetSnapshots(raw);
    if (changed) writeFileAtomic(BACKUP_FILE, json).catch(() => { /* best-effort migration */ });
    return json;
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

  async saveDailyBaseline(baseline: DailyBaseline): Promise<void> {
    await set(KEYS.DAILY_BASELINE, JSON.stringify(baseline));
  },

  async loadDailyBaseline(): Promise<DailyBaseline | null> {
    const raw = await get(KEYS.DAILY_BASELINE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DailyBaseline;
    } catch {
      return null;
    }
  },

  async clearDailyBaseline(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.DAILY_BASELINE);
  },

  // MF NAV history (keyed by ISIN) — survives backup reloads, since observed
  // NAVs are fund-level facts independent of which backup is loaded.
  async saveMfNavHistory(history: Record<string, MfNavPoint>): Promise<void> {
    await set(KEYS.MF_NAV_HISTORY, JSON.stringify(history));
  },

  async loadMfNavHistory(): Promise<Record<string, MfNavPoint>> {
    const raw = await get(KEYS.MF_NAV_HISTORY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, MfNavPoint>;
    } catch {
      return {};
    }
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
    // Same as saveBackup: drop asset_snapshots so cached profiles stay small.
    const slim = stripAssetSnapshots(json).json;
    await Promise.all([
      FileSystem.writeAsStringAsync(path, slim, { encoding: FileSystem.EncodingType.UTF8 }),
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
    // Same OOM guard as loadBackupJson — returning null makes the caller fall
    // back to a fresh Drive download instead of reading an oversized cache file.
    if (info.size > MAX_BACKUP_BYTES) {
      console.warn(`[storage] cached profile is ${(info.size / MB).toFixed(0)} MB (> ${MAX_BACKUP_BYTES / MB} MB) — skipping read.`);
      return null;
    }
    try {
      const raw = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      const { json, changed } = stripAssetSnapshots(raw);
      if (changed) FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 }).catch(() => { /* best-effort */ });
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
