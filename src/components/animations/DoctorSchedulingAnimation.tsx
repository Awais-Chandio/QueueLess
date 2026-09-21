import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Circle, Path, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

export const DoctorSchedulingAnimation = () => {
  const { colors, isDarkMode } = useTheme();

  // Animations
  const clockRotate = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const cardFloat = useRef(new Animated.Value(0)).current;
  const ecgOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Clock Rotation (continuous)
    Animated.loop(
      Animated.timing(clockRotate, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 2. Pulse heart scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.15, duration: 250, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 0.95, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.05, duration: 200, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(1000),
      ])
    ).start();

    // 3. Card float up and down
    Animated.loop(
      Animated.sequence([
        Animated.timing(cardFloat, {
          toValue: -8,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(cardFloat, {
          toValue: 8,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 4. ECG Line flow
    Animated.loop(
      Animated.timing(ecgOffset, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Interpolations
  const rotationStr = clockRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ecgTranslateX = ecgOffset.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={styles.container}>
      {/* Glow effect at the background */}
      <View style={[styles.glow, { backgroundColor: colors.primary + '20' }]} />

      <Svg width={95} height={95} viewBox="0 0 100 100" fill="none">
        <Defs>
          <LinearGradient id="medicalTealGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="100%" stopColor="#14B8A6" />
          </LinearGradient>
          <LinearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary + '30'} />
            <Stop offset="100%" stopColor="transparent" />
          </LinearGradient>
        </Defs>

        {/* Circular grid or background medical grid */}
        <Circle cx="50" cy="50" r="45" stroke={isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'} strokeWidth="1" strokeDasharray="4 4" />
        <Circle cx="50" cy="50" r="35" stroke={isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)'} strokeWidth="1" />

        {/* Main Base Shield/Tablet Icon */}
        <Rect x="20" y="15" width="60" height="70" rx="12" fill={isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)'} stroke="url(#medicalTealGrad)" strokeWidth="2" />
        
        {/* Medical Cross Background Glow */}
        <Path d="M 50 30 L 50 46 M 42 38 L 58 38" stroke={colors.primary + '15'} strokeWidth="10" strokeLinecap="round" />
        {/* Heart beat ECG overlay line */}
        <Path d="M 22 75 Q 35 75 38 75 L 43 60 L 48 85 L 53 70 L 57 75 L 78 75" stroke={isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.1)'} strokeWidth="2" strokeLinecap="round" />
      </Svg>

      {/* Animated Clock */}
      <Animated.View style={[styles.clockContainer, { transform: [{ rotate: rotationStr }] }]}>
        <Svg width={24} height={24} viewBox="0 0 30 30" fill="none">
          <Circle cx="15" cy="15" r="12" stroke={colors.primary} strokeWidth="2" fill={isDarkMode ? '#12233E' : '#FFFFFF'} />
          <Path d="M 15 6 L 15 15 L 21 15" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      </Animated.View>

      {/* Animated Heart Rate Pulse */}
      <Animated.View style={[styles.heartContainer, { transform: [{ scale: pulseScale }] }]}>
        <Svg width={26} height={26} viewBox="0 0 30 30" fill="none">
          <Path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="url(#medicalTealGrad)"
          />
        </Svg>
      </Animated.View>

      {/* Floating Card Timeslot */}
      <Animated.View style={[styles.floatingCard, { transform: [{ translateY: cardFloat }] }, { backgroundColor: isDarkMode ? '#1E3A66' : '#FFFFFF', borderColor: colors.border }]}>
        <View style={[styles.cardDot, { backgroundColor: '#14B8A6' }]} />
        <View style={styles.cardLine} />
        <View style={[styles.cardLineShort, { backgroundColor: colors.primary }]} />
      </Animated.View>
    </View>
  );
};

export default DoctorSchedulingAnimation;

const styles = StyleSheet.create({
  container: {
    height: 95,
    width: 95,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(1),
  },
  glow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    opacity: 0.15,
  },
  clockContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  heartContainer: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  floatingCard: {
    position: 'absolute',
    width: 44,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    padding: 4,
    bottom: 32,
    right: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    justifyContent: 'space-between',
  },
  cardDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cardLine: {
    width: '85%',
    height: 2,
    backgroundColor: '#E2E8F0',
    borderRadius: 1,
  },
  cardLineShort: {
    width: '50%',
    height: 2,
    borderRadius: 1,
  },
});
