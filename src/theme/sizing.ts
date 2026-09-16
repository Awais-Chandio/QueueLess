import { scaleFont } from '../utils/responsive';

/**
 * Size tokens for controls, icons and avatars.
 *
 * Control heights are fixed values rather than a percentage of screen height.
 * The previous `minHeight: hp(5.6)` resolved to roughly 36pt on a small phone,
 * below the 44pt minimum touch target, and shrank further wherever a call site
 * overrode it. `control.md` is the floor for anything tappable.
 */
export const sizing = {
  /** Minimum touch target on every platform. Apple HIG 44pt / Material 48dp. */
  minTouch: 44,

  control: {
    /** Compact controls inside dense rows. Still meets the 44pt floor. */
    sm: scaleFont(44),
    /** Default button and input height. */
    md: scaleFont(50),
    /** Primary call to action at the bottom of a screen. */
    lg: scaleFont(56),
  },

  icon: {
    xs: scaleFont(14),
    sm: scaleFont(16),
    md: scaleFont(20),
    lg: scaleFont(24),
    xl: scaleFont(28),
  },

  avatar: {
    sm: scaleFont(32),
    md: scaleFont(40),
    lg: scaleFont(56),
    xl: scaleFont(88),
  },

  /**
   * The bottom tab bar floats above content, so screens inside the tab
   * navigator have to reserve this much room or the last row scrolls under it.
   * `reserve` is the bar plus its bottom inset; add the safe-area inset on top.
   */
  tabBar: {
    height: scaleFont(62),
    inset: scaleFont(12),
    get reserve() {
      return this.height + this.inset;
    },
  },

  /** Expands the touch target of small icon-only controls without resizing them. */
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  /** Hairline that stays crisp across densities. */
  borderWidth: 1,
} as const;
