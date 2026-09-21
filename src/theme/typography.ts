import type { TextStyle } from 'react-native';
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

/**
 * Named text roles. A screen picks a role instead of a size + weight pair, so
 * the same kind of information looks the same everywhere in the app.
 *
 * Inter ships no Light or Thin face and none is added on purpose: clinical
 * information (token numbers, doses, times, statuses) must stay legible at a
 * glance and in bright light.
 *
 * `fontSize` is left un-clamped so the OS font-size setting still scales text;
 * `Text` keeps its default `allowFontScaling`. Only `Wordmark` opts out, and
 * only because a logotype is a mark rather than text.
 */
export const textRoles = {
  /** Screen-defining number or title. One per screen at most. */
  display: { fontSize: scaleFont(30), fontWeight: '700', lineHeight: scaleFont(36), letterSpacing: -0.5 },
  /** Screen title in a header. */
  heading: { fontSize: scaleFont(23), fontWeight: '700', lineHeight: scaleFont(29), letterSpacing: -0.3 },
  /** Section title inside a screen. */
  section: { fontSize: scaleFont(18), fontWeight: '600', lineHeight: scaleFont(24), letterSpacing: -0.2 },
  /** Card and list-row titles. */
  subtitle: { fontSize: scaleFont(16), fontWeight: '600', lineHeight: scaleFont(22) },
  /** Default running text. */
  body: { fontSize: scaleFont(15), fontWeight: '400', lineHeight: scaleFont(22) },
  /** Running text where emphasis is needed without a size change. */
  bodyStrong: { fontSize: scaleFont(15), fontWeight: '600', lineHeight: scaleFont(22) },
  /** Field labels, chips, tabs, and button text. */
  label: { fontSize: scaleFont(13), fontWeight: '500', lineHeight: scaleFont(18) },
  /** Supporting text: timestamps, helper copy, metadata. */
  caption: { fontSize: scaleFont(12), fontWeight: '400', lineHeight: scaleFont(16) },
} satisfies Record<string, TextStyle>;

export type TextRole = keyof typeof textRoles;

export const typography = {
  fontFamily: fontFamilies.regular,
  fonts: fontFamilies,
  roles: textRoles,
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
    // `normal` was '500', which rendered every "unweighted" string in Inter
    // Medium and flattened the contrast between body copy and emphasis.
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};
