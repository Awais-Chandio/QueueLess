import { useThemeStore } from '../store/themeStore';
import { lightColors, darkColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

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
