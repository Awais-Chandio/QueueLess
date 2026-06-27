import { Platform, ViewStyle } from 'react-native';

export const medicalTheme = {
  primary: '#2563EB',
  primaryLight: '#60A5FA',
  primaryDark: '#1D4ED8',
  success: '#14B8A6',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  disabled: '#CBD5E1',
  shadowLight: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  } as ViewStyle,
  shadowMedium: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  shadowLarge: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
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
    android: 'Roboto',
    default: 'System',
  }),
};
