import { useThemeStore } from '../store/themeStore';
import { lightColors, darkColors } from '../theme/colors';
import { spacing, radius, typography } from '../theme';

export const useTheme = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const colors = isDarkMode ? darkColors : lightColors;

  return {
    isDarkMode,
    colors,
    spacing,
    radius,
    typography,
  };
};
