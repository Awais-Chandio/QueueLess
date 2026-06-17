import React, { useEffect } from 'react';
import { View, Animated, StyleSheet, DimensionValue } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: any;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 20, borderRadius, style }) => {
  const { colors, radius } = useTheme();
  const opacity = new Animated.Value(0.3);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: colors.skeleton,
          borderRadius: borderRadius ?? radius.sm,
          opacity,
        },
        style,
      ]}
    />
  );
};
