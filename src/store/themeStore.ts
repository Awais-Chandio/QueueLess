import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 'system' follows the phone's light/dark setting (the default). */
export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      mode: 'system',
      setMode: mode => set({ mode }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v0 stored only a dark-mode switch, so "off" can't be told apart from
      // "never touched": dark stays dark, everything else follows the system.
      migrate: persisted => {
        const old = persisted as { isDarkMode?: boolean } | undefined;
        return { mode: old?.isDarkMode ? 'dark' : 'system' } as ThemeState;
      },
    },
  ),
);

export const resolveDarkMode = (mode: ThemeMode, systemScheme: string | null | undefined) =>
  mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
