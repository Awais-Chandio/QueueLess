/**
 * MediQ colour system.
 *
 * The brand hue is `#0E7490`. It is not a free variable: the launcher icon in
 * `scripts/generate-app-icons.js` and the accent "Q" in `Wordmark.tsx` are both
 * generated from these values, so changing `primary`, `gradients.primary` or
 * `accent` desyncs the in-app palette from the shipped app icon. Regenerate the
 * brand assets if you ever do change them.
 *
 * Light and dark are authored as two intentional palettes over one set of
 * semantic names — dark is never a computed inversion of light. Semantic roles
 * that read as "positive" or "dangerous" are deliberately *lighter* in dark mode
 * so they stay legible on a dark surface.
 */

export type StatusTone = {
  /** Chip / badge fill. */
  bg: string;
  /** Label colour, contrast-checked against `bg`. */
  fg: string;
  /** Solid hue for the status dot and hairline border. Never the only signal. */
  dot: string;
  /** Human-facing label. */
  label: string;
};

/**
 * Every status the app can render, including the non-appointment tones
 * (`success`/`warning`/`error`/`info`/`default`/`all`) used by filters and
 * inline banners. Screens must read from here rather than hand-picking a hue,
 * so a status means the same colour everywhere it appears.
 */
export type StatusPalette = {
  pending: StatusTone;
  confirmed: StatusTone;
  called: StatusTone;
  in_progress: StatusTone;
  completed: StatusTone;
  cancelled: StatusTone;
  checked_in: StatusTone;
  expired: StatusTone;
  no_show: StatusTone;
  skipped: StatusTone;
  doctor_on_break: StatusTone;
  success: StatusTone;
  warning: StatusTone;
  error: StatusTone;
  info: StatusTone;
  default: StatusTone;
  all: StatusTone;
};

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

  // --- added by the redesign ------------------------------------------------
  /** Label/icon colour on a filled `primary` surface. */
  onPrimary: string;
  /** Label/icon colour on a filled `error` surface. */
  onError: string;
  /** Recessed background for grouped rows and inset sections. */
  surfaceSunken: string;
  /** Raised background one step above `surface`, for nested cards. */
  surfaceRaised: string;
  /** Hairline between rows. Lighter than `border`, which outlines shapes. */
  divider: string;
  /** Focus ring for inputs and keyboard/AT focus. */
  focus: string;
  /** Low-opacity fills for icon wells, soft badges and selected chips. */
  tint: {
    primary: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    neutral: string;
  };
  status: StatusPalette;
};

// ==========================================
// LIGHT
// ==========================================
const lightStatus: StatusPalette = {
  pending:         { bg: '#F59E0B14', fg: '#92400E', dot: '#F59E0B', label: 'Pending' },
  confirmed:       { bg: '#0E749014', fg: '#155E75', dot: '#0E7490', label: 'Confirmed' },
  called:          { bg: '#14B8A614', fg: '#0F766E', dot: '#14B8A6', label: 'Called' },
  in_progress:     { bg: '#14B8A614', fg: '#0F766E', dot: '#14B8A6', label: 'In Progress' },
  completed:       { bg: '#16A34A14', fg: '#14532D', dot: '#16A34A', label: 'Completed' },
  cancelled:       { bg: '#DC262614', fg: '#991B1B', dot: '#DC2626', label: 'Cancelled' },
  checked_in:      { bg: '#0E749014', fg: '#155E75', dot: '#0E7490', label: 'Checked In' },
  expired:         { bg: '#64748B14', fg: '#334155', dot: '#64748B', label: 'Expired' },
  no_show:         { bg: '#DC262614', fg: '#991B1B', dot: '#DC2626', label: 'No Show' },
  skipped:         { bg: '#DC262614', fg: '#991B1B', dot: '#DC2626', label: 'Skipped' },
  doctor_on_break: { bg: '#F59E0B14', fg: '#92400E', dot: '#F59E0B', label: 'Break Mode' },
  success:         { bg: '#16A34A14', fg: '#14532D', dot: '#16A34A', label: 'Success' },
  warning:         { bg: '#F59E0B14', fg: '#92400E', dot: '#F59E0B', label: 'Warning' },
  error:           { bg: '#DC262614', fg: '#991B1B', dot: '#DC2626', label: 'Error' },
  info:            { bg: '#0E749014', fg: '#155E75', dot: '#0E7490', label: 'Info' },
  default:         { bg: '#94A3B814', fg: '#475569', dot: '#94A3B8', label: 'Unknown' },
  all:             { bg: '#0E749014', fg: '#155E75', dot: '#0E7490', label: 'All' },
};

export const clientColorsLight: ColorTheme = {
  primary: '#0E7490',
  primaryLight: '#ECFEFF',
  primaryDark: '#155E75',
  secondary: '#10B981',
  secondaryLight: '#D1FAE5',
  secondaryDark: '#065F46',
  accent: '#14B8A6',
  background: '#F7FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  disabled: '#94A3B8',
  error: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
  info: '#0891B2',
  skeleton: '#E7EDF3',
  skeletonHighlight: '#F4F8FB',
  overlay: 'rgba(15, 23, 42, 0.56)',
  glassBorder: 'rgba(14, 116, 144, 0.12)',
  // Neutral slate rather than a teal glow: a tinted shadow reads as decoration.
  shadowColor: '#0F172A',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#14B8A6'],
    card: ['#FFFFFF', '#F7FAFC'],
  },

  onPrimary: '#FFFFFF',
  onError: '#FFFFFF',
  surfaceSunken: '#F1F5F9',
  surfaceRaised: '#FFFFFF',
  divider: '#EDF2F7',
  focus: '#0E7490',
  tint: {
    primary: 'rgba(14, 116, 144, 0.10)',
    accent: 'rgba(20, 184, 166, 0.12)',
    success: 'rgba(22, 163, 74, 0.10)',
    warning: 'rgba(245, 158, 11, 0.12)',
    error: 'rgba(220, 38, 38, 0.10)',
    info: 'rgba(8, 145, 178, 0.10)',
    neutral: 'rgba(100, 116, 139, 0.10)',
  },
  status: lightStatus,
};

// ==========================================
// DARK
// ==========================================
// Positive/destructive hues are lifted here rather than reused from light:
// #16A34A and #DC2626 are too dark to read on a dark surface.
const darkStatus: StatusPalette = {
  pending:         { bg: '#F59E0B26', fg: '#FDE68A', dot: '#FBBF24', label: 'Pending' },
  confirmed:       { bg: '#0891B226', fg: '#A5F3FC', dot: '#22D3EE', label: 'Confirmed' },
  called:          { bg: '#14B8A626', fg: '#99F6E4', dot: '#2DD4BF', label: 'Called' },
  in_progress:     { bg: '#14B8A626', fg: '#99F6E4', dot: '#2DD4BF', label: 'In Progress' },
  completed:       { bg: '#10B98126', fg: '#A7F3D0', dot: '#34D399', label: 'Completed' },
  cancelled:       { bg: '#F8717126', fg: '#FECACA', dot: '#F87171', label: 'Cancelled' },
  checked_in:      { bg: '#0891B226', fg: '#A5F3FC', dot: '#22D3EE', label: 'Checked In' },
  expired:         { bg: '#94A3B826', fg: '#CBD5E1', dot: '#94A3B8', label: 'Expired' },
  no_show:         { bg: '#F8717126', fg: '#FECACA', dot: '#F87171', label: 'No Show' },
  skipped:         { bg: '#F8717126', fg: '#FECACA', dot: '#F87171', label: 'Skipped' },
  doctor_on_break: { bg: '#F59E0B26', fg: '#FDE68A', dot: '#FBBF24', label: 'Break Mode' },
  success:         { bg: '#10B98126', fg: '#A7F3D0', dot: '#34D399', label: 'Success' },
  warning:         { bg: '#F59E0B26', fg: '#FDE68A', dot: '#FBBF24', label: 'Warning' },
  error:           { bg: '#F8717126', fg: '#FECACA', dot: '#F87171', label: 'Error' },
  info:            { bg: '#0891B226', fg: '#A5F3FC', dot: '#22D3EE', label: 'Info' },
  default:         { bg: '#94A3B826', fg: '#CBD5E1', dot: '#94A3B8', label: 'Unknown' },
  all:             { bg: '#0891B226', fg: '#A5F3FC', dot: '#22D3EE', label: 'All' },
};

export const clientColorsDark: ColorTheme = {
  primary: '#22A2C3',
  primaryLight: '#083344',
  primaryDark: '#0E7490',
  secondary: '#10B981',
  secondaryLight: '#064E3B',
  secondaryDark: '#047857',
  accent: '#2DD4BF',
  // Desaturated slate-teal rather than pure black, so elevation stays readable.
  background: '#0B1315',
  surface: '#121C1F',
  card: '#162326',
  text: '#F1F5F9',
  textSecondary: '#AFC0C6',
  textTertiary: '#7D9199',
  border: '#223438',
  disabled: '#4A5C62',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  info: '#22D3EE',
  skeleton: '#1D2E32',
  skeletonHighlight: '#263B40',
  overlay: 'rgba(0, 0, 0, 0.66)',
  glassBorder: 'rgba(45, 212, 191, 0.16)',
  shadowColor: '#000000',
  gradients: {
    primary: ['#0E7490', '#0891B2'],
    accent: ['#10B981', '#14B8A6'],
    card: ['#162326', '#121C1F'],
  },

  // On dark, `primary` is light enough that white-on-primary loses contrast.
  onPrimary: '#04191F',
  onError: '#2A0A0A',
  surfaceSunken: '#0E181B',
  surfaceRaised: '#1B2A2E',
  divider: '#1C2C30',
  focus: '#2DD4BF',
  tint: {
    primary: 'rgba(34, 162, 195, 0.16)',
    accent: 'rgba(45, 212, 191, 0.16)',
    success: 'rgba(52, 211, 153, 0.16)',
    warning: 'rgba(251, 191, 36, 0.16)',
    error: 'rgba(248, 113, 113, 0.16)',
    info: 'rgba(34, 211, 238, 0.16)',
    neutral: 'rgba(148, 163, 184, 0.14)',
  },
  status: darkStatus,
};

// Every role renders the same palette. The split is kept because `useTheme`
// still branches on role and removing it is a behavioural change, not a visual
// one; if roles are ever re-themed, this is the seam to do it at.
export const staffColorsLight = clientColorsLight;
export const staffColorsDark = clientColorsDark;
export const adminColorsLight = clientColorsLight;
export const adminColorsDark = clientColorsDark;

export const lightColors = clientColorsLight;
export const darkColors = clientColorsDark;
export const colors = lightColors;
