import { scaleFont } from '../utils/responsive';

/**
 * Corner radii.
 *
 * `xl` was 24, which turned a ~44pt control into a full pill and made buttons
 * and cards read as consumer-app rather than clinical. It is now 20, and the
 * semantic aliases below are what new code should reach for — they say what a
 * shape *is*, so the scale can be retuned without auditing call sites again.
 */
export const radius = {
  sm: scaleFont(8),
  md: scaleFont(12),
  lg: scaleFont(16),
  xl: scaleFont(20),
  xxl: scaleFont(32),
  borderRadius: scaleFont(12),
  full: 9999,

  /** Buttons, inputs, and other ~44pt tall controls. */
  control: scaleFont(14),
  /** Cards, tiles, and list rows. */
  card: scaleFont(16),
  /** Bottom sheets and modal surfaces. */
  sheet: scaleFont(24),
  /** Chips, badges, and avatars, where a pill is correct. */
  pill: 9999,
};
