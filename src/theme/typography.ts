import { scaleFont } from '../utils/responsive';

/**
 * Inter is shipped as static TTFs in src/assets/fonts. Each file's PostScript
 * name matches its filename exactly (Inter-Regular, Inter-Medium, ...), so the
 * same family string resolves on both iOS (PostScript name) and Android
 * (asset filename).
 *
 * Screens should never hardcode a fontFamily: `applyGlobalFont` maps the
 * `fontWeight` in any text style onto the matching family below, so the weight
 * tokens in this file keep working unchanged.
 */
export const fontFamilies = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extrabold: 'Inter-ExtraBold',
} as const;

export type FontWeightToken = keyof typeof fontFamilies;

/** Numeric fontWeight -> Inter family. Used by the global text patch. */
export const fontFamilyForWeight: Record<string, string> = {
  '100': fontFamilies.regular,
  '200': fontFamilies.regular,
  '300': fontFamilies.regular,
  '400': fontFamilies.regular,
  normal: fontFamilies.regular,
  '500': fontFamilies.medium,
  '600': fontFamilies.semibold,
  '700': fontFamilies.bold,
  bold: fontFamilies.bold,
  '800': fontFamilies.extrabold,
  '900': fontFamilies.extrabold,
};

export const typography = {
  fontFamily: fontFamilies.regular,
  fonts: fontFamilies,
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
