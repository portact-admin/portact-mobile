import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

export const WEB_CLIENT_ID = '833400940320-ofe4sta7e3u8dcabucllb1r5vmkqgoii.apps.googleusercontent.com';
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export interface GoogleUser {
  user: {
    email: string;
    name: string | null;
    photo: string | null;
    id: string;
  };
  idToken: string | null;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const BACKUP_MIME = 'application/json';
const BACKUP_NAME_PREFIX = 'portact_backup';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

export class GoogleDriveError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'GoogleDriveError';
    this.code = code;
  }
}

function configureGoogleSignIn(webClientId: string): void {
  GoogleSignin.configure({
    webClientId,
    scopes: SCOPES,
  });
}

async function getAccessToken(): Promise<string> {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

async function driveRequest<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${DRIVE_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GoogleDriveError(`Drive API ${res.status}: ${body}`, String(res.status));
  }
  return res.json() as Promise<T>;
}

export const googleDriveService = {
  configure(webClientId: string): void {
    configureGoogleSignIn(webClientId);
  },

  async signIn(): Promise<GoogleUser> {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      return result as unknown as GoogleUser;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new GoogleDriveError('Sign-in cancelled.', 'CANCELLED');
      }
      if (e.code === statusCodes.IN_PROGRESS) {
        throw new GoogleDriveError('Sign-in already in progress.', 'IN_PROGRESS');
      }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleDriveError('Google Play Services not available.', 'NO_PLAY_SERVICES');
      }
      throw new GoogleDriveError((err as Error).message ?? 'Sign-in failed.');
    }
  },

  async signInSilently(): Promise<void> {
    await GoogleSignin.signInSilently();
  },

  async signOut(): Promise<void> {
    await GoogleSignin.signOut();
  },

  async isSignedIn(): Promise<boolean> {
    const user = await GoogleSignin.getCurrentUser();
    return user !== null;
  },

  async getCurrentUser(): Promise<GoogleUser | null> {
    return GoogleSignin.getCurrentUser() as unknown as GoogleUser | null;
  },

  async listBackupFiles(): Promise<DriveFile[]> {
    const token = await getAccessToken();
    const query = `name contains '${BACKUP_NAME_PREFIX}' and mimeType='${BACKUP_MIME}' and trashed=false`;
    const result = await driveRequest<{ files: DriveFile[] }>(
      '/files',
      token,
      {
        q: query,
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,modifiedTime,size)',
        pageSize: '20',
      },
    );
    return result.files ?? [];
  },

  async downloadFile(fileId: string): Promise<string> {
    const token = await getAccessToken();
    const url = `${DRIVE_API}/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new GoogleDriveError(`Download failed: ${res.status}`, String(res.status));
    }
    return res.text();
  },

  async fetchLatestBackup(): Promise<{ content: string; file: DriveFile }> {
    const files = await this.listBackupFiles();
    if (files.length === 0) {
      throw new GoogleDriveError(
        'No PortAct backup files found in your Google Drive. Please export a backup from the PortAct web app first.',
        'NO_BACKUPS',
      );
    }
    const latest = files[0];
    const content = await this.downloadFile(latest.id);
    return { content, file: latest };
  },
};
