export type ColorTheme = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
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
  glassBorder: string;
  shadowColor: string;
  gradients: {
    primary: [string, string];
    accent: [string, string];
    card: [string, string];
  };
};

// ==========================================
// QUEUELESS PREMIUM HEALTHCARE BRAND (Light Mode)
// ==========================================
export const clientColorsLight: ColorTheme = {
  primary: '#0E7490', // Deep Medical Blue
  primaryLight: '#ECFEFF',
  primaryDark: '#155E75',
  secondary: '#10B981', // Healthcare Green
  secondaryLight: '#D1FAE5',
  secondaryDark: '#065F46',
  accent: '#14B8A6', // Teal
  background: '#F8FAFC', // Soft Off White
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  disabled: '#94A3B8',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#0891B2',
  skeleton: '#E2E8F0',
  skeletonHighlight: '#F8FAFC',
  overlay: 'rgba(15, 23, 42, 0.56)',
  glassBorder: 'rgba(14, 116, 144, 0.12)',
  shadowColor: '#0E7490',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#14B8A6'],
    card: ['#FFFFFF', '#F0FDFA'],
  },
};

// ==========================================
// QUEUELESS PREMIUM HEALTHCARE BRAND (Dark Mode)
// ==========================================
export const clientColorsDark: ColorTheme = {
  primary: '#0891B2',
  primaryLight: '#083344',
  primaryDark: '#0E7490',
  secondary: '#10B981',
  secondaryLight: '#064E3B',
  secondaryDark: '#047857',
  accent: '#14B8A6',
  background: '#0B1315',
  surface: '#111A1C',
  card: '#152224',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textTertiary: '#94A3B8',
  border: '#1E2F32',
  disabled: '#475569',
  error: '#F87171',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#0891B2',
  skeleton: '#1E2F32',
  skeletonHighlight: '#253B3E',
  overlay: 'rgba(0, 0, 0, 0.7)',
  glassBorder: 'rgba(8, 145, 178, 0.18)',
  shadowColor: '#000000',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#14B8A6'],
    card: ['#152224', '#111A1C'],
  },
};

// Map all roles to the same unified client light/dark colors
export const staffColorsLight = clientColorsLight;
export const staffColorsDark = clientColorsDark;
export const adminColorsLight = clientColorsLight;
export const adminColorsDark = clientColorsDark;

// Keep lightColors / darkColors for compatibility
export const lightColors = clientColorsLight;
export const darkColors = clientColorsDark;
export const colors = lightColors;
