import { scaleFont } from '../utils/responsive';

export const typography = {
  fontFamily: 'System',
  fonts: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },
  h1: scaleFont(28),
  h2: scaleFont(24),
  h3: scaleFont(20),
  body: scaleFont(16),
  small: scaleFont(14),
  caption: scaleFont(12),
  sizes: {
    xs: scaleFont(12),
    sm: scaleFont(14),
    md: scaleFont(16),
    lg: scaleFont(18),
    xl: scaleFont(20),
    xxl: scaleFont(24),
  },
  weights: {
    normal: '500' as const,
    medium: '600' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};
