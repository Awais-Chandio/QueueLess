import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

interface MedicalLogoProps {
  size?: number;
  showBackground?: boolean;
  qColor?: string;
  crossColor?: string;
}

/**
 * The MediQ mark — "Check M": the M's centre valley is drawn as an asymmetric
 * checkmark and tinted in the accent, so "confirmed / your turn" sits inside
 * the monogram.
 *
 * This is the same geometry as the launcher icon (see
 * scripts/generate-app-icons.js). If the mark changes, change it in both places
 * so the in-app logo and the home-screen icon do not drift apart.
 *
 * The `qColor` / `crossColor` prop names predate this mark and are kept so the
 * existing call sites keep working: `qColor` is the letterform, `crossColor`
 * the accent check.
 */
export const MedicalLogo: React.FC<MedicalLogoProps> = ({
  size = 80,
  showBackground = false,
  qColor,
  crossColor,
}) => {
  const { colors } = useTheme();

  const strokeColor = qColor || (showBackground ? '#FFFFFF' : colors.primary);
  // On the primary gradient the mid-tone accent is too close in value to read,
  // so the lighter tint is used there — the same one the app icon's check uses.
  const checkColor = crossColor || (showBackground ? '#5EEAD4' : colors.accent);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
        <Defs>
          <LinearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.gradients.primary[0]} />
            <Stop offset="100%" stopColor={colors.gradients.primary[1]} />
          </LinearGradient>
        </Defs>

        {showBackground ? (
          <Rect x="0" y="0" width="1024" height="1024" rx="228" fill="url(#logoBg)" />
        ) : null}

        <Path
          d="M316 700V372L474 588L708 312V700"
          stroke={strokeColor}
          strokeWidth="76"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M316 372L474 588L708 312"
          stroke={checkColor}
          strokeWidth="76"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};

export default MedicalLogo;
