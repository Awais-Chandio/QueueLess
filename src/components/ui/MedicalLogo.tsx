import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

interface MedicalLogoProps {
  size?: number;
  showBackground?: boolean;
  qColor?: string;
  crossColor?: string;
}

export const MedicalLogo: React.FC<MedicalLogoProps> = ({
  size = 80,
  showBackground = false,
  qColor,
  crossColor,
}) => {
  const { colors } = useTheme();

  const finalQColor = qColor || (showBackground ? '#FFFFFF' : colors.primary);
  const finalCrossColor = crossColor || (showBackground ? '#A7F3D0' : colors.success);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <Defs>
          <LinearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#0F766E" />
            <Stop offset="100%" stopColor="#14B8A6" />
          </LinearGradient>
          <LinearGradient id="pinGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={showBackground ? 0.96 : 0} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={showBackground ? 0.7 : 0} />
          </LinearGradient>
        </Defs>

        {showBackground ? (
          <Rect
            x="2"
            y="2"
            width="96"
            height="96"
            rx="24"
            fill="url(#bgGradient)"
          />
        ) : null}

        {showBackground ? (
          <Circle cx="50" cy="44" r="26" fill="url(#pinGradient)" opacity="0.16" />
        ) : null}

        {/* QueueLess mark: location pin + queue tail */}
        <Path
          d="M50 15C65.5 15 78 27.6 78 43.1C78 61.8 50 84 50 84C50 84 22 61.8 22 43.1C22 27.6 34.5 15 50 15Z"
          stroke={finalQColor}
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M66 65C72 70.5 77 76.4 84 80"
          stroke={finalQColor}
          strokeWidth="6.5"
          strokeLinecap="round"
        />

        {/* Appointment node */}
        <Circle cx="50" cy="43" r="18" fill="none" stroke={finalQColor} strokeWidth="4" opacity={showBackground ? 0.7 : 0.34} />

        {/* Medical cross */}
        <Path
          d="M50 31V55M38 43H62"
          stroke={finalCrossColor}
          strokeWidth="5.5"
          strokeLinecap="round"
        />

        {/* Heartbeat and queue flow */}
        <Path
          d="M30 60H40L44 52L50 68L56 44L61 60H70"
          stroke={finalCrossColor}
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Connected queue dots */}
        <Circle cx="32" cy="60" r="3" fill={finalCrossColor} />
        <Circle cx="70" cy="60" r="3" fill={finalCrossColor} />
        <Path
          d="M36 72H50H64"
          stroke={finalQColor}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={showBackground ? 0.72 : 0.38}
        />
      </Svg>
    </View>
  );
};

export default MedicalLogo;
