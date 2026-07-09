import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Text } from 'react-native';
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

export const RealtimeNotificationAnimation = () => {
  const { colors, isDarkMode } = useTheme();

  // Animation values
  const bellRotate = useRef(new Animated.Value(0)).current;
  const alertSlide1 = useRef(new Animated.Value(-40)).current;
  const alertOpacity1 = useRef(new Animated.Value(0)).current;
  const alertSlide2 = useRef(new Animated.Value(-40)).current;
  const alertOpacity2 = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Bell Swing loop
    const runBellSwing = () => {
      Animated.sequence([
        Animated.timing(bellRotate, { toValue: 15, duration: 150, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: -15, duration: 250, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 10, duration: 200, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: -10, duration: 200, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 5, duration: 150, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 0, duration: 150, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(2000),
      ]).start(() => {
        runBellSwing();
      });
    };
    runBellSwing();

    // 2. Alert Notification slide-in sequence loop
    const runAlertSequence = () => {
      alertSlide1.setValue(-40);
      alertOpacity1.setValue(0);
      alertSlide2.setValue(-40);
      alertOpacity2.setValue(0);
      checkScale.setValue(0);

      Animated.sequence([
        Animated.delay(500),
        // Alert 1 slide in
        Animated.parallel([
          Animated.spring(alertSlide1, { toValue: 0, friction: 6, tension: 30, useNativeDriver: true }),
          Animated.timing(alertOpacity1, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(600),
        // Alert 2 slide in
        Animated.parallel([
          Animated.spring(alertSlide2, { toValue: 0, friction: 6, tension: 30, useNativeDriver: true }),
          Animated.timing(alertOpacity2, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(400),
        // Checkmark pops up
        Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
        Animated.delay(2500),
      ]).start(() => {
        runAlertSequence();
      });
    };
    runAlertSequence();
  }, []);

  // Interpolations
  const rotateStr = bellRotate.interpolate({
    inputRange: [-15, 15],
    outputRange: ['-15deg', '15deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background Soft Glow */}
      <View style={[styles.glow, { backgroundColor: colors.primary + '18' }]} />

      {/* Bell ringing animation at the top */}
      <Animated.View style={[styles.bellWrapper, { transform: [{ rotate: rotateStr }] }]}>
        <Svg width={60} height={60} viewBox="0 0 24 24" fill="none">
          <Defs>
            <LinearGradient id="gradientBell" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#14B8A6" />
              <Stop offset="100%" stopColor="#14B8A6" />
            </LinearGradient>
          </Defs>
          <Path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
            stroke="url(#gradientBell)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Floating Notifications Cards */}
      <View style={styles.alertContainer}>
        {/* Alert 1 */}
        <Animated.View style={[
          styles.alertCard,
          { opacity: alertOpacity1, transform: [{ translateY: alertSlide1 }] },
          { backgroundColor: isDarkMode ? '#12233E' : '#FFFFFF', borderColor: colors.border }
        ]}>
          <View style={[styles.alertDot, { backgroundColor: colors.primary }]} />
          <View style={styles.alertContent}>
            <View style={[styles.alertLine, { width: '80%', backgroundColor: colors.text }]} />
            <View style={[styles.alertLineShort, { width: '50%', backgroundColor: colors.textSecondary }]} />
          </View>
        </Animated.View>

        {/* Alert 2 */}
        <Animated.View style={[
          styles.alertCard,
          { opacity: alertOpacity2, transform: [{ translateY: alertSlide2 }] },
          { backgroundColor: isDarkMode ? '#1E3A66' : '#FFFFFF', borderColor: colors.border }
        ]}>
          <View style={[styles.alertDot, { backgroundColor: '#14B8A6' }]} />
          <View style={styles.alertContent}>
            <View style={[styles.alertLine, { width: '65%', backgroundColor: colors.text }]} />
            <View style={[styles.alertLineShort, { width: '45%', backgroundColor: colors.textSecondary }]} />
          </View>
          
          {/* Success Check badge overlay */}
          <Animated.View style={[styles.successBadge, { transform: [{ scale: checkScale }] }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="12" r="10" fill="#14B8A6" />
              <Path d="M9 12l2 2 4-4" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
};

export default RealtimeNotificationAnimation;

const styles = StyleSheet.create({
  container: {
    height: hp(36),
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.15,
  },
  bellWrapper: {
    top: hp(2),
    position: 'absolute',
  },
  alertContainer: {
    position: 'absolute',
    bottom: hp(2),
    width: '100%',
    alignItems: 'center',
  },
  alertCard: {
    width: 220,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(1.2),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    position: 'relative',
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  alertContent: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-around',
  },
  alertLine: {
    height: 4,
    borderRadius: 2,
    opacity: 0.25,
  },
  alertLineShort: {
    height: 3,
    borderRadius: 1.5,
    opacity: 0.15,
  },
  successBadge: {
    position: 'absolute',
    right: -6,
    top: -6,
    elevation: 4,
  },
});
