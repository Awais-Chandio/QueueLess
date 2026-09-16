import { Platform, type ViewStyle } from 'react-native';

/**
 * Elevation tokens.
 *
 * Before the redesign, elevation was written inline per component and tinted
 * with the brand hue (`shadowColor: '#0F766E'`), which produced a coloured glow
 * under buttons and cards. A glow reads as decoration; a healthcare surface
 * wants the shadow to communicate depth only. These are neutral, and light mode
 * is deliberately soft — `border` carries most of the separation, with the
 * shadow only lifting the shape off the background.
 *
 * Dark mode raises opacity because a shadow has to work against a dark
 * background to be visible at all, and drops `elevation` slightly on Android
 * where the platform already lightens raised surfaces.
 */
export type ElevationLevel = 'none' | 'xs' | 'sm' | 'md' | 'lg';

export type Shadows = Record<ElevationLevel, ViewStyle>;

type Spec = {
  offsetY: number;
  radius: number;
  opacityLight: number;
  opacityDark: number;
  elevation: number;
};

const SPECS: Record<Exclude<ElevationLevel, 'none'>, Spec> = {
  // Resting list rows and chips.
  xs: { offsetY: 1, radius: 3, opacityLight: 0.04, opacityDark: 0.24, elevation: 1 },
  // Cards at rest.
  sm: { offsetY: 2, radius: 8, opacityLight: 0.06, opacityDark: 0.3, elevation: 2 },
  // Raised cards, primary buttons, pressed-state lift.
  md: { offsetY: 4, radius: 14, opacityLight: 0.08, opacityDark: 0.36, elevation: 4 },
  // Sheets, floating bars, dialogs.
  lg: { offsetY: 10, radius: 24, opacityLight: 0.12, opacityDark: 0.44, elevation: 10 },
};

const NONE: ViewStyle = Platform.select({
  ios: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  default: { elevation: 0 },
}) as ViewStyle;

const build = (spec: Spec, shadowColor: string, isDark: boolean): ViewStyle =>
  Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: spec.offsetY },
      shadowOpacity: isDark ? spec.opacityDark : spec.opacityLight,
      shadowRadius: spec.radius,
    },
    default: {
      // Android renders `elevation` with its own opaque shadow; `shadowColor`
      // is honoured from API 28 up and ignored harmlessly below that.
      shadowColor,
      elevation: isDark ? Math.max(1, spec.elevation - 1) : spec.elevation,
    },
  }) as ViewStyle;

/**
 * Builds the elevation set for a theme. `useTheme()` memoises the result, so
 * components should read `shadows` from the hook rather than calling this.
 */
export const createShadows = (shadowColor: string, isDark: boolean): Shadows => ({
  none: NONE,
  xs: build(SPECS.xs, shadowColor, isDark),
  sm: build(SPECS.sm, shadowColor, isDark),
  md: build(SPECS.md, shadowColor, isDark),
  lg: build(SPECS.lg, shadowColor, isDark),
});
