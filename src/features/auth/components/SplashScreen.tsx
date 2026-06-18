import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont } from '../../../utils/responsive';

const queueLessIcon = require('../../../assets/branding/queueless-icon.png');

const SplashScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const entrance = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entranceAnimation = Animated.spring(entrance, {
      toValue: 1,
      damping: 12,
      stiffness: 110,
      mass: 0.8,
      useNativeDriver: true,
    });

    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const progressAnimation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );

    entranceAnimation.start();
    floatAnimation.start();
    progressAnimation.start();

    return () => {
      entranceAnimation.stop();
      floatAnimation.stop();
      progressAnimation.stop();
    };
  }, [entrance, float, progress]);

  const logoTranslateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const glowScale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });

  const progressTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 90],
  });

  return (
    <View style={styles.container}>
      <View style={styles.ambientTop} />
      <View style={styles.ambientBottom} />

      <Animated.View
        style={[
          styles.glow,
          {
            opacity: entrance,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.logoShell,
          {
            opacity: entrance,
            transform: [
              { scale: entrance },
              { translateY: logoTranslateY },
            ],
          },
        ]}
      >
        <Image source={queueLessIcon} resizeMode="cover" style={styles.logo} />
      </Animated.View>

      <Animated.View
        style={[
          styles.copy,
          {
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text
          style={[
            styles.title,
            {
              fontSize: typography.sizes.xxl,
              marginTop: spacing.xxl,
            },
          ]}
        >
          QueueLess
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              fontSize: typography.sizes.sm,
              marginTop: spacing.sm,
            },
          ]}
        >
          Skip the wait. Keep moving.
        </Text>
      </Animated.View>

      <View style={[styles.loadingArea, { marginTop: spacing.xxl * 2 }]}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressGlow,
              { transform: [{ translateX: progressTranslateX }] },
            ]}
          />
        </View>
        <Text
          style={[
            styles.loadingText,
            {
              color: colors.primaryLight,
              fontSize: typography.sizes.xs,
              marginTop: spacing.md,
            },
          ]}
        >
          Getting your queue ready
        </Text>
      </View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  ambientBottom: {
    backgroundColor: '#5414A8',
    borderRadius: 240,
    bottom: -180,
    height: 360,
    opacity: 0.2,
    position: 'absolute',
    right: -160,
    width: 360,
  },
  ambientTop: {
    backgroundColor: '#123EEB',
    borderRadius: 220,
    height: 320,
    left: -170,
    opacity: 0.22,
    position: 'absolute',
    top: -150,
    width: 320,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#05061C',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 24,
  },
  copy: {
    alignItems: 'center',
  },
  glow: {
    backgroundColor: '#7047FF',
    borderRadius: 110,
    height: 190,
    opacity: 0.25,
    position: 'absolute',
    shadowColor: '#17DFF5',
    shadowOpacity: 0.7,
    shadowRadius: 34,
    width: 190,
  },
  loadingArea: {
    alignItems: 'center',
  },
  loadingText: {
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  logo: {
    borderRadius: 36,
    height: scaleFont(136),
    width: scaleFont(136),
  },
  logoShell: {
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 42,
    borderWidth: 1,
    elevation: 14,
    overflow: 'hidden',
    shadowColor: '#16DFF4',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  progressGlow: {
    backgroundColor: '#24E7F5',
    borderRadius: 3,
    height: 4,
    shadowColor: '#24E7F5',
    shadowOpacity: 0.9,
    shadowRadius: 7,
    width: 74,
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    height: 4,
    overflow: 'hidden',
    width: 180,
  },
  subtitle: {
    color: '#A8B2D8',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
