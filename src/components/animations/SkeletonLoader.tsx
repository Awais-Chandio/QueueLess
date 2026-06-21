import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

type SkeletonLoaderProps = {
  height?: number;
  count?: number;
  style?: StyleProp<ViewStyle>;
  gap?: number;
};

export const SkeletonLoader = ({
  height = 20,
  count = 1,
  style,
  gap = 12,
}: SkeletonLoaderProps) => {
  const { colors, radius } = useTheme();
  const itemHeight = scaleFont(height);
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={`skeleton-${index}`}
          style={[
            {
              width: '100%',
              height: itemHeight,
              backgroundColor: colors.skeleton,
              borderRadius: radius.sm,
              marginBottom: index < count - 1 ? gap : 0,
              opacity,
            },
            style,
          ]}
        />
      ))}
    </>
  );
};
