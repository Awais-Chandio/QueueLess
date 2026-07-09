import { Platform, ViewStyle } from 'react-native';

export const medicalTheme = {
  primary: '#0F766E',
  primaryLight: '#14B8A6',
  primaryDark: '#115E59',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  background: '#F6F9FC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#64748B',
  border: '#E2E8F0',
  disabled: '#94A3B8',
  shadowLight: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  } as ViewStyle,
  shadowMedium: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 7,
  } as ViewStyle,
  shadowLarge: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 34,
    elevation: 12,
  } as ViewStyle,
};

export const medicalSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const medicalTypography = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 16,
  small: 14,
  caption: 12,
  fontFamily: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
};
