import { useMemo } from 'react';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import {
  clientColorsLight,
  clientColorsDark,
  staffColorsLight,
  staffColorsDark,
  adminColorsLight,
  adminColorsDark,
  ColorTheme,
} from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { createShadows, type Shadows } from '../theme/shadows';
import { motion } from '../theme/motion';
import { sizing } from '../theme/sizing';

export type Theme = {
  isDarkMode: boolean;
  colors: ColorTheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: Shadows;
  motion: typeof motion;
  sizing: typeof sizing;
};

export const useTheme = (): Theme => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const role = useAuthStore((state) => state.role);

  // All roles currently resolve to the same palette. The branch is kept so the
  // seam survives if roles are ever themed separately.
  const colors: ColorTheme = useMemo(() => {
    if (role === 'admin') {
      return isDarkMode ? adminColorsDark : adminColorsLight;
    }
    if (role === 'staff') {
      return isDarkMode ? staffColorsDark : staffColorsLight;
    }
    // Default to client colours (e.g. for onboarding, guest screens)
    return isDarkMode ? clientColorsDark : clientColorsLight;
  }, [isDarkMode, role]);

  // Rebuilt only when the palette flips, so the style objects stay referentially
  // stable across renders and don't defeat `React.memo` in list rows.
  const shadows = useMemo(
    () => createShadows(colors.shadowColor, isDarkMode),
    [colors.shadowColor, isDarkMode],
  );

  return useMemo(
    () => ({
      isDarkMode,
      colors,
      spacing,
      radius,
      typography,
      shadows,
      motion,
      sizing,
    }),
    [colors, isDarkMode, shadows],
  );
};
