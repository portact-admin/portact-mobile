import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'portact:theme_preference';

interface ThemeStore {
  preference: ThemePreference;
  setPreference(p: ThemePreference): Promise<void>;
  loadPreference(): Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: 'system',

  async loadPreference() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        set({ preference: raw });
      }
    } catch { /* silent */ }
  },

  async setPreference(preference) {
    set({ preference });
    try {
      await AsyncStorage.setItem(KEY, preference);
    } catch { /* silent */ }
  },
}));
