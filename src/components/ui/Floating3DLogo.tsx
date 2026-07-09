import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import MedicalLogo from './MedicalLogo';

interface Floating3DLogoProps {
  size?: number;
  showBackground?: boolean;
  qColor?: string;
  crossColor?: string;
}

export const Floating3DLogo: React.FC<Floating3DLogoProps> = ({
  size = 90,
  showBackground = true,
  qColor,
  crossColor,
}) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -4,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(tilt, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 4,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(tilt, {
            toValue: -1,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    floatLoop.start();
    return () => floatLoop.stop();
  }, [tilt, translateY]);

  const rotate = tilt.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-3deg', '3deg'],
  });

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.pressable}>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              { translateY },
              { rotate },
              { scale: pressScale },
            ],
          },
        ]}
      >
        <MedicalLogo
          size={size}
          showBackground={showBackground}
          qColor={qColor}
          crossColor={crossColor}
        />
      </Animated.View>
    </Pressable>
  );
};

export default Floating3DLogo;

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
