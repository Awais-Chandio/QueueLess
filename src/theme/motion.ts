/**
 * Motion tokens.
 *
 * Motion in MediQ is there to explain a change, not to decorate one. Durations
 * are short on purpose: a queue screen is read repeatedly, often while standing
 * in a clinic, and animation that draws attention to itself gets tiring fast.
 *
 * Anything longer than `slow` belongs to the splash or a Lottie graphic, not to
 * interface feedback.
 */
export const motion = {
  duration: {
    /** Press feedback, ripples, colour changes. */
    instant: 120,
    /** The default. Fades, small translations, chip selection. */
    fast: 200,
    /** Screen and section entry, skeleton crossfades. */
    normal: 280,
    /** Sheets, expanding panels, number roll-ups. */
    slow: 400,
  },
  /** Delay between siblings in a staggered list entry. */
  stagger: 45,
  /** Distance a section travels on entry. Small enough to read as a settle. */
  translate: 12,
  /** Scale applied while a control is held down. */
  pressScale: 0.97,
  spring: {
    /** Default for gesture-driven and press feedback. */
    default: { damping: 18, stiffness: 220, mass: 1 },
    /** Softer settle for sheets and large surfaces. */
    gentle: { damping: 22, stiffness: 160, mass: 1 },
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
