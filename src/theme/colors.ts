export type ColorTheme = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
};

export const lightColors: ColorTheme = {
  primary: '#4F46E5', // Indigo
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  skeleton: '#E2E8F0',
  skeletonHighlight: '#F1F5F9',
  overlay: 'rgba(15, 23, 42, 0.5)',
};

export const darkColors: ColorTheme = {
  primary: '#6366F1', // Lighter Indigo for dark mode
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  info: '#60A5FA',
  skeleton: '#334155',
  skeletonHighlight: '#475569',
  overlay: 'rgba(15, 23, 42, 0.7)',
};

// Default export for legacy compatibility if any
export const colors = lightColors;