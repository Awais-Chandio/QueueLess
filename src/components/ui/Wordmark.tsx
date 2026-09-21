import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

/**
 * The MediQ logotype.
 *
 * Use this anywhere the app name stands on its own as branding. Do NOT use it
 * for the name inside running copy ("Join MediQ to skip waiting lines") or as a
 * settings row label ("About MediQ") — logotype treatment inside a sentence
 * reads as a typo rather than as branding.
 *
 * Two things separate this from body text:
 *  - Inter ExtraBold, via the weight token. The font family itself is resolved
 *    by the global font patch, so nothing here hardcodes a fontFamily.
 *  - Negative tracking. Positive letter-spacing reads as a caption; tightening
 *    is the standard move that makes a name read as a drawn logotype.
 *
 * The "Q" carries the accent colour, because the Q is the queue — it ties the
 * wordmark to the accent in the app icon.
 */

export type WordmarkTone = 'onColor' | 'onSurface';

interface WordmarkProps {
  /** Rendered size. Passed through scaleFont, so give unscaled design values. */
  size?: number;
  /** 'onColor' for gradient/primary headers, 'onSurface' for normal backgrounds. */
  tone?: WordmarkTone;
  /** Tints the Q. Defaults to the accent for the given tone. */
  accentColor?: string;
  /** Overrides the colour of "Medi". Defaults to the tone's text colour. */
  color?: string;
  style?: StyleProp<TextStyle>;
  /** Appended after the logotype in plain body weight, e.g. "Care". */
  suffix?: string;
}

/** Tracking tightens as the type gets bigger, the way a drawn logotype would. */
const trackingFor = (size: number) => -(size * 0.028);

export const Wordmark: React.FC<WordmarkProps> = ({
  size = 24,
  tone = 'onColor',
  accentColor,
  color,
  style,
  suffix,
}) => {
  const { colors, typography } = useTheme();
  const fontSize = scaleFont(size);

  const baseColor = color ?? (tone === 'onColor' ? '#FFFFFF' : colors.text);
  // On the primary gradient the mid-tone accent is too close in value to read,
  // so the lighter tint is used there — the same one the app icon's check uses.
  const qColor = accentColor ?? (tone === 'onColor' ? '#5EEAD4' : colors.accent);

  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel={suffix ? `MediQ ${suffix}` : 'MediQ'}
      allowFontScaling={false}
      style={[
        styles.root,
        {
          fontSize,
          letterSpacing: trackingFor(fontSize),
          color: baseColor,
          fontWeight: typography.weights.extrabold,
        },
        style,
      ]}
    >
      Medi
      <Text style={{ color: qColor }}>Q</Text>
      {suffix ? (
        <Text style={[styles.suffix, { fontWeight: typography.weights.medium }]}>{` ${suffix}`}</Text>
      ) : null}
    </Text>
  );
};

const styles = StyleSheet.create({
  root: {
    includeFontPadding: false,
    textAlign: 'center',
  },
  // The suffix is ordinary copy sitting beside the logotype, so it opts out of
  // the wordmark's tightened tracking.
  suffix: {
    letterSpacing: 0,
  },
});

export default Wordmark;
