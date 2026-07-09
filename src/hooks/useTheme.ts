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

export const useTheme = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const role = useAuthStore((state) => state.role);

  let colors: ColorTheme;

  if (role === 'admin') {
    colors = isDarkMode ? adminColorsDark : adminColorsLight;
  } else if (role === 'staff') {
    colors = isDarkMode ? staffColorsDark : staffColorsLight;
  } else {
    // Default to client colors (e.g. for onboarding, guest screens)
    colors = isDarkMode ? clientColorsDark : clientColorsLight;
  }

  return {
    isDarkMode,
    colors,
    spacing,
    radius,
    typography,
  };
};
