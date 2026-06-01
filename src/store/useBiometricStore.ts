import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'portact:biometric_lock_enabled';

interface BiometricStore {
  enabled: boolean;
  locked: boolean;
  setEnabled(val: boolean): Promise<void>;
  loadPreference(): Promise<void>;
  lock(): void;
  unlock(): void;
}

export const useBiometricStore = create<BiometricStore>((set) => ({
  enabled: false,
  locked: false,

  async loadPreference() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const enabled = raw === 'true';
      set({ enabled, locked: enabled });
    } catch { /* silent */ }
  },

  async setEnabled(val) {
    set({ enabled: val, locked: val });
    try {
      await AsyncStorage.setItem(KEY, val ? 'true' : 'false');
    } catch { /* silent */ }
  },

  lock() {
    set({ locked: true });
  },

  unlock() {
    set({ locked: false });
  },
}));
