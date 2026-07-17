import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Text } from 'react-native';
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

export const QueueTrackingAnimation = () => {
  const { colors, isDarkMode } = useTheme();

  // Animation values
  const pathOffset = useRef(new Animated.Value(0)).current;
  const pulseNode = useRef(new Animated.Value(1)).current;
  const queueSpin = useRef(new Animated.Value(0)).current;
  const numTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Moving node along path
    Animated.loop(
      Animated.timing(pathOffset, {
        toValue: 1,
        duration: 3500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 2. Pulse active node
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseNode, { toValue: 1.25, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseNode, { toValue: 0.9, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseNode, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(500),
      ])
    ).start();

    // 3. Loader spin
    Animated.loop(
      Animated.timing(queueSpin, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 4. Floating queue numbers slide-up loop
    const runNumLoop = () => {
      numTranslateY.setValue(0);
      Animated.timing(numTranslateY, {
        toValue: -20,
        duration: 1500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setTimeout(runNumLoop, 1000);
      });
    };
    runNumLoop();
  }, []);

  // Interpolations
  const dotTranslateX = pathOffset.interpolate({
    inputRange: [0, 0.4, 0.7, 1],
    outputRange: [wp(16), wp(32), wp(45), wp(60)],
  });

  const dotTranslateY = pathOffset.interpolate({
    inputRange: [0, 0.4, 0.7, 1],
    outputRange: [hp(16), hp(11), hp(15), hp(13)],
  });

  const spinStr = queueSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background Soft Glow */}
      <View style={[styles.glow, { backgroundColor: '#14B8A618' }]} />

      {/* Background grid */}
      <View style={styles.gridContainer}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200">
          <Circle cx="100" cy="100" r="75" stroke={colors.border + '30'} strokeWidth="1" />
          <Circle cx="100" cy="100" r="45" stroke={colors.border + '20'} strokeWidth="1" />
        </Svg>
      </View>

      {/* Custom SVG Queue Line */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 300 200">
          <Defs>
            <LinearGradient id="gradientPath" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={colors.primary} />
              <Stop offset="100%" stopColor="#14B8A6" />
            </LinearGradient>
          </Defs>
          {/* Curved Queue Path */}
          <Path
            d="M 50 130 C 100 80, 180 140, 250 90"
            stroke="url(#gradientPath)"
            strokeWidth="3.5"
            strokeDasharray="6 6"
            fill="none"
          />

          {/* Static Queue nodes */}
          <Circle cx="50" cy="130" r="7" fill={colors.primary} />
          <Circle cx="132" cy="104" r="7" fill={colors.primary} />
          <Circle cx="250" cy="90" r="7" fill="#14B8A6" />
        </Svg>
      </View>

      {/* Floating moving node */}
      <Animated.View style={[
        styles.movingNode, 
        { 
          transform: [
            { translateX: dotTranslateX }, 
            { translateY: dotTranslateY }, 
            { scale: pulseNode }
          ] 
        },
        { backgroundColor: '#14B8A6' }
      ]} />

      {/* Live Queue status card */}
      <View style={[
        styles.statusCard, 
        { backgroundColor: isDarkMode ? '#12233E' : '#FFFFFF', borderColor: colors.border }
      ]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>LIVE STATUS</Text>
          <View style={styles.pulseDot} />
        </View>

        <View style={styles.cardContent}>
          {/* Animated Spinner */}
          <Animated.View style={{ transform: [{ rotate: spinStr }] }}>
            <Svg width={36} height={36} viewBox="0 0 36 36">
              <Circle cx="18" cy="18" r="14" stroke={colors.border} strokeWidth="3" fill="none" />
              <Path d="M18 4 A14 14 0 0 1 32 18" stroke={colors.primary} strokeWidth="3.5" strokeLinecap="round" fill="none" />
            </Svg>
          </Animated.View>

          <View style={styles.numberWrapper}>
            <Animated.View style={{ transform: [{ translateY: numTranslateY }] }}>
              <Text style={[styles.queueNumber, { color: colors.primary }]}>3</Text>
              <Text style={[styles.queueNumber, { color: colors.primary }]}>4</Text>
            </Animated.View>
            <Text style={[styles.numberSuffix, { color: colors.textSecondary }]}>in line</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default QueueTrackingAnimation;

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
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.15,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  movingNode: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    elevation: 6,
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  statusCard: {
    position: 'absolute',
    width: 170,
    height: 90,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
    bottom: hp(2),
    alignSelf: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: scaleFont(10),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flex: 1,
  },
  numberWrapper: {
    height: 36,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueNumber: {
    fontSize: scaleFont(20),
    fontWeight: '900',
    textAlign: 'center',
    height: 20,
    lineHeight: 20,
  },
  numberSuffix: {
    fontSize: scaleFont(9),
    fontWeight: '700',
    marginTop: 2,
  },
});
