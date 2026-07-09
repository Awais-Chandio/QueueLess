import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Circle, Path, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

export const DoctorConsultationAnimation = () => {
  const { colors, isDarkMode } = useTheme();

  // Animations
  const ringScale1 = useRef(new Animated.Value(0.8)).current;
  const ringOpacity1 = useRef(new Animated.Value(1)).current;
  const ringScale2 = useRef(new Animated.Value(0.8)).current;
  const ringOpacity2 = useRef(new Animated.Value(1)).current;

  const chat1Opacity = useRef(new Animated.Value(0)).current;
  const chat1TranslateY = useRef(new Animated.Value(10)).current;
  const chat2Opacity = useRef(new Animated.Value(0)).current;
  const chat2TranslateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    // 1. Concentric ring 1
    Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale1, {
          toValue: 1.6,
          duration: 3000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(ringOpacity1, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
          Animated.timing(ringOpacity1, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ]),
      ])
    ).start();

    // 2. Concentric ring 2 (delayed start)
    setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.timing(ringScale2, {
            toValue: 1.6,
            duration: 3000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(ringOpacity2, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
            Animated.timing(ringOpacity2, { toValue: 0, duration: 1500, useNativeDriver: true }),
          ]),
        ])
      ).start();
    }, 1500);

    // 3. Chat Bubble loops
    const runChatAnimation = () => {
      // Reset values
      chat1Opacity.setValue(0);
      chat1TranslateY.setValue(10);
      chat2Opacity.setValue(0);
      chat2TranslateY.setValue(10);

      Animated.sequence([
        // Chat 1 fades in
        Animated.parallel([
          Animated.timing(chat1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(chat1TranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.delay(1200),
        // Chat 2 fades in
        Animated.parallel([
          Animated.timing(chat2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(chat2TranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.delay(1800),
        // Both fade out
        Animated.parallel([
          Animated.timing(chat1Opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(chat2Opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(500),
      ]).start(() => {
        runChatAnimation();
      });
    };
    runChatAnimation();
  }, []);

  return (
    <View style={styles.container}>
      {/* Dynamic Background Glow */}
      <View style={[styles.glow, { backgroundColor: '#14B8A615' }]} />

      {/* Animated Concentric Rings */}
      <Animated.View style={[styles.ring, { transform: [{ scale: ringScale1 }], opacity: ringOpacity1, borderColor: colors.primary + '40' }]} />
      <Animated.View style={[styles.ring, { transform: [{ scale: ringScale2 }], opacity: ringOpacity2, borderColor: '#14B8A640' }]} />

      {/* Base Stethoscope & Doctor Head Svg */}
      <Svg width={80} height={80} viewBox="0 0 100 100" fill="none">
        <Defs>
          <LinearGradient id="gradientDoctor" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="100%" stopColor="#14B8A6" />
          </LinearGradient>
        </Defs>

        {/* Doctor Icon Silhouette */}
        <Circle cx="50" cy="40" r="16" fill="url(#gradientDoctor)" />
        <Path d="M 22 76 C 22 62, 34 58, 50 58 C 66 58, 78 62, 78 76 L 78 80 L 22 80 Z" fill="url(#gradientDoctor)" />

        {/* Doctor Stethoscope detail */}
        <Path d="M 40 50 Q 50 56 60 50" stroke={isDarkMode ? '#0F172A' : '#FFFFFF'} strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M 50 54 L 50 64 Q 50 70, 56 70" stroke={isDarkMode ? '#0F172A' : '#FFFFFF'} strokeWidth="2.5" strokeLinecap="round" />
      </Svg>

      {/* Floating Chat Bubble 1 (Left) */}
      <Animated.View style={[
        styles.chatBubble, 
        styles.chatLeft, 
        { opacity: chat1Opacity, transform: [{ translateY: chat1TranslateY }] },
        { backgroundColor: isDarkMode ? '#12233E' : '#FFFFFF', borderColor: colors.border }
      ]}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.6 }]} />
        <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.3 }]} />
      </Animated.View>

      {/* Floating Chat Bubble 2 (Right) */}
      <Animated.View style={[
        styles.chatBubble, 
        styles.chatRight, 
        { opacity: chat2Opacity, transform: [{ translateY: chat2TranslateY }] },
        { backgroundColor: colors.primary, borderColor: colors.primary }
      ]}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12h14M12 5l7 7-7 7" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
};

export default DoctorConsultationAnimation;

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
    width: 65,
    height: 65,
    borderRadius: 32.5,
    opacity: 0.6,
  },
  ring: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
  },
  chatBubble: {
    position: 'absolute',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  chatLeft: {
    top: 15,
    left: -5,
    width: 36,
    height: 20,
    justifyContent: 'space-around',
  },
  chatRight: {
    bottom: 30,
    right: -5,
    width: 26,
    height: 20,
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
