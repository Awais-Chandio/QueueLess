import { scaleFont } from '../utils/responsive';

/**
 * 4pt spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
 *
 * The `xs`–`xxl` names predate the redesign and are used in ~100 files, so they
 * keep their values; `xxxl`–`giant` extend the scale upward for section breaks
 * and empty-state padding, which previously had to stack two tokens.
 */
export const spacing = {
  xs: scaleFont(4),
  sm: scaleFont(8),
  md: scaleFont(12),
  lg: scaleFont(16),
  xl: scaleFont(20),
  xxl: scaleFont(24),
  xxxl: scaleFont(32),
  huge: scaleFont(40),
  giant: scaleFont(48),

  /** Default horizontal padding for a screen's content column. */
  screen: scaleFont(20),
  /** Gap between sibling cards in a list or grid. */
  gutter: scaleFont(12),
};
