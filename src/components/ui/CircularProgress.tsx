import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { scaleFont } from '../../utils/responsive';

interface CircularProgressProps {
  /** 0 to 1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Text shown in the center */
  centerLabel?: string;
  /** Small caption below center label */
  centerCaption?: string;
  centerLabelColor?: string;
  centerCaptionColor?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 120,
  strokeWidth = 10,
  color = '#0F766E',
  trackColor = '#E2E8F0',
  centerLabel,
  centerCaption,
  centerLabelColor = '#12233E',
  centerCaptionColor = '#64748B',
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, progress]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.centerContent}>
        {centerLabel !== undefined && (
          <Text
            style={[
              styles.centerLabel,
              { color: centerLabelColor, fontSize: scaleFont(size * 0.175) },
            ]}
            numberOfLines={1}
          >
            {centerLabel}
          </Text>
        )}
        {centerCaption !== undefined && (
          <Text
            style={[
              styles.centerCaption,
              { color: centerCaptionColor, fontSize: scaleFont(size * 0.09) },
            ]}
            numberOfLines={1}
          >
            {centerCaption}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontWeight: '800',
    textAlign: 'center',
  },
  centerCaption: {
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
});

export default CircularProgress;
