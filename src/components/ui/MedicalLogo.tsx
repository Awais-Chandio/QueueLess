import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
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
  const finalCrossColor = crossColor || (showBackground ? '#FFFFFF' : '#14B8A6');

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <Defs>
          {/* Professional gradient from Blue to Teal */}
          <LinearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="100%" stopColor="#14B8A6" />
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
        
        {/* Main Q Circle */}
        <Circle
          cx="50"
          cy="46"
          r="24"
          stroke={finalQColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* Q Tail */}
        <Path
          d="M 67 63 L 83 79"
          stroke={finalQColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* Medical Cross in the center */}
        <Path
          d="M 50 34 L 50 58 M 38 46 L 62 46"
          stroke={finalCrossColor}
          strokeWidth="7"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
};

export default MedicalLogo;
