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
  primary: '#0E7490',
  primaryLight: '#ECFEFF',
  primaryDark: '#155E75',
  background: '#F6F9FC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#64748B',
  border: '#E2E8F0',
  disabled: '#94A3B8',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#0891B2',
  skeleton: '#E2E8F0',
  skeletonHighlight: '#F8FAFC',
  overlay: 'rgba(15, 23, 42, 0.56)',
  glassBorder: 'rgba(14, 116, 144, 0.18)',
  shadowColor: '#0E7490',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#0891B2'],
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
  background: '#071E22',
  surface: '#0B2C33',
  card: '#0E3A42',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textTertiary: '#94A3B8',
  border: '#155E6B',
  disabled: '#475569',
  error: '#F87171',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#0891B2',
  skeleton: '#0E3A42',
  skeletonHighlight: '#155E6B',
  overlay: 'rgba(0, 0, 0, 0.7)',
  glassBorder: 'rgba(8, 145, 178, 0.22)',
  shadowColor: '#000000',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#0891B2'],
    card: ['#0E3A42', '#0B2C33'],
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
