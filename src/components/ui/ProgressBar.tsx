import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, DimensionValue } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface ProgressBarProps {
  progress: number; // 0 to 1
  height?: number;
  color?: string;
  trackColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, height = 8, color, trackColor }) => {
  const { colors, radius } = useTheme();
  const animatedProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor || colors.border, borderRadius: radius.full }]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color || colors.primary, borderRadius: radius.full }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
