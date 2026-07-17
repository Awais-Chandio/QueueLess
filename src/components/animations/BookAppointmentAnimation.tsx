import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import RNLinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

export const BookAppointmentAnimation = () => {
  const { colors, isDarkMode } = useTheme();

  // Animation values
  const calendarFloat = useRef(new Animated.Value(0)).current;
  const docCardSlide = useRef(new Animated.Value(60)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const particle1Y = useRef(new Animated.Value(0)).current;
  const particle2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Calendar Float
    Animated.loop(
      Animated.sequence([
        Animated.timing(calendarFloat, {
          toValue: -10,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(calendarFloat, {
          toValue: 10,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 2. Doctor Card Slide-in and scaling checkmark loop
    const runSequence = () => {
      // Reset values
      docCardSlide.setValue(60);
      checkScale.setValue(0);

      Animated.sequence([
        Animated.delay(300),
        // Doctor card slides in
        Animated.spring(docCardSlide, {
          toValue: 0,
          friction: 6,
          tension: 25,
          useNativeDriver: true,
        }),
        Animated.delay(400),
        // Checkmark pops up
        Animated.spring(checkScale, {
          toValue: 1,
          friction: 5,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        // Fade/Slide out trigger
        Animated.parallel([
          Animated.timing(docCardSlide, { toValue: 60, duration: 400, useNativeDriver: true }),
          Animated.timing(checkScale, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]),
      ]).start(() => {
        runSequence();
      });
    };
    runSequence();

    // 3. Floating background particles
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle1Y, { toValue: -15, duration: 3000, useNativeDriver: true }),
        Animated.timing(particle1Y, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle2Y, { toValue: 20, duration: 4000, useNativeDriver: true }),
        Animated.timing(particle2Y, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
  }, [calendarFloat, checkScale, docCardSlide, particle1Y, particle2Y]);

  return (
    <View style={styles.container}>
      {/* Background Soft Glow */}
      <View
        style={[
          styles.glow,
          {
            backgroundColor: isDarkMode ? '#14B8A6' : '#A7F3D0',
            opacity: isDarkMode ? 0.16 : 0.42,
          },
        ]}
      />

      {/* Background grid */}
      <View style={styles.gridContainer}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200">
          <Circle cx="100" cy="100" r="85" stroke={colors.border + '50'} strokeWidth="1" strokeDasharray="6 6" fill="none" />
          <Circle cx="100" cy="100" r="55" stroke={colors.border + '30'} strokeWidth="1" fill="none" />
        </Svg>
      </View>

      {/* Floating Particles */}
      <Animated.View style={[styles.particle, { top: hp(6), left: wp(10), transform: [{ translateY: particle1Y }] }]}>
        <View style={[styles.dot, { backgroundColor: '#14B8A6', width: 8, height: 8 }]} />
      </Animated.View>
      <Animated.View style={[styles.particle, { bottom: hp(8), right: wp(15), transform: [{ translateY: particle2Y }] }]}>
        <View style={[styles.dot, { backgroundColor: colors.primary, width: 12, height: 12 }]} />
      </Animated.View>

      {/* Animated Calendar Sheet */}
      <Animated.View style={[styles.calendarSheet, { transform: [{ translateY: calendarFloat }] }, { backgroundColor: isDarkMode ? '#102F2F' : '#FFFFFF', borderColor: colors.border }]}>
        {/* Calendar Header */}
        <RNLinearGradient colors={colors.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.calendarHeader}>
          <View style={styles.headerDot} />
          <View style={styles.headerDot} />
        </RNLinearGradient>
        
        {/* Calendar Grid Lines */}
        <View style={styles.calendarBody}>
          <View style={styles.calendarRow}>
            <View style={styles.calendarCellActive} />
            <View style={styles.calendarCell} />
            <View style={styles.calendarCell} />
          </View>
          <View style={styles.calendarRow}>
            <View style={styles.calendarCell} />
            <View style={styles.calendarCell} />
            <View style={[styles.calendarCell, { position: 'relative' }]}>
              {/* Pulsing check mark indicator */}
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M22 4L12 14.01l-3-3" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Animated.View>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Doctor Card Slide-in (right side) */}
      <Animated.View style={[
        styles.doctorCard, 
        { transform: [{ translateX: docCardSlide }] },
        { backgroundColor: isDarkMode ? '#123B3A' : '#FFFFFF', borderColor: colors.border }
      ]}>
        <View style={[styles.doctorAvatar, { backgroundColor: colors.primary + '20' }]}>
          <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="12" cy="7" r="4" stroke={colors.primary} strokeWidth="2.5" />
          </Svg>
        </View>
        <View style={styles.doctorInfo}>
          <View style={[styles.infoLine, { width: '70%', backgroundColor: colors.text }]} />
          <View style={[styles.infoLine, { width: '40%', backgroundColor: colors.textSecondary }]} />
          <View style={styles.badgeRow}>
            <View style={[styles.tag, { backgroundColor: '#E6FFFB' }]}>
              <Text style={{ color: '#0F766E', fontSize: scaleFont(9), fontWeight: '700' }}>10:00 AM</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

export default BookAppointmentAnimation;

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
    opacity: 0.7,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
  },
  dot: {
    borderRadius: 6,
    opacity: 0.5,
  },
  calendarSheet: {
    width: 130,
    height: 120,
    borderRadius: 12,
    borderWidth: 1.5,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    overflow: 'hidden',
    position: 'absolute',
    left: wp(18),
    top: hp(6),
  },
  calendarHeader: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  calendarBody: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-around',
  },
  calendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarCell: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellActive: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#E6FFFB',
  },
  doctorCard: {
    position: 'absolute',
    width: 160,
    height: 75,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    right: wp(14),
    bottom: hp(5),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  doctorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  doctorInfo: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-around',
  },
  infoLine: {
    height: 4,
    borderRadius: 2,
    opacity: 0.2,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
