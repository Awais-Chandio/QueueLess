export type ColorTheme = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  disabled: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
};

export const lightColors: ColorTheme = {
  primary: '#2E7DFF',
  primaryLight: '#E3F2FD',
  primaryDark: '#1565C0',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  disabled: '#CBD5E1',
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
  skeleton: '#E2E8F0',
  skeletonHighlight: '#F1F5F9',
  overlay: 'rgba(15, 23, 42, 0.5)',
};

export const darkColors: ColorTheme = {
  primary: '#5B9DFF',
  primaryLight: '#1E3A5F',
  primaryDark: '#2E7DFF',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  border: '#334155',
  disabled: '#475569',
  error: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  info: '#60A5FA',
  skeleton: '#334155',
  skeletonHighlight: '#475569',
  overlay: 'rgba(15, 23, 42, 0.72)',
};

// Default export for legacy compatibility if any
export const colors = lightColors;
