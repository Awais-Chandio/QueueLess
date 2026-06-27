import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import MedicalLogo from '../../../components/ui/MedicalLogo';

interface SplashScreenProps {
  onAnimationComplete?: () => void;
  isReady?: boolean;
  isGentlyLoading?: boolean;
  message?: string;
}

const SplashScreen = ({
  onAnimationComplete,
  isReady = true,
  isGentlyLoading = false,
  message,
}: SplashScreenProps) => {
  const { colors, spacing, typography } = useTheme();

  // Animation values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const text1Opacity = useRef(new Animated.Value(0)).current;
  const text1TranslateY = useRef(new Animated.Value(15)).current;
  const text2Opacity = useRef(new Animated.Value(0)).current;
  const text2TranslateY = useRef(new Animated.Value(15)).current;
  const text3Opacity = useRef(new Animated.Value(0)).current;
  const text3TranslateY = useRef(new Animated.Value(15)).current;

  // Pulse animation for heartbeat
  const heartbeatAnim = useRef(new Animated.Value(1)).current;
  const loadingPulse = useRef(new Animated.Value(0)).current;

  // Track if intro animation sequence has finished
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    if (isGentlyLoading) {
      // If it's a secondary loading screen, we don't need the full intro sequence.
      // Just keep everything visible, fade in the container, and pulse the logo gently.
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      text1Opacity.setValue(1);
      text1TranslateY.setValue(0);
      text2Opacity.setValue(1);
      text2TranslateY.setValue(0);
      text3Opacity.setValue(1);
      text3TranslateY.setValue(0);
      setIntroFinished(true);

      // Fade in the container smoothly
      containerOpacity.setValue(0);
      Animated.timing(containerOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.05,
            duration: 800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    // Sequence timing
    // 1. Fade & Scale Logo in
    const logoIntro = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]);

    // 2. Double heartbeat pulse right after fade-in completes
    const heartbeatSequence = Animated.sequence([
      Animated.timing(heartbeatAnim, {
        toValue: 1.08,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(heartbeatAnim, {
        toValue: 1.02,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(heartbeatAnim, {
        toValue: 1.06,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(heartbeatAnim, {
        toValue: 1.0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]);

    // 3. Text fading sequences
    const text1Intro = Animated.parallel([
      Animated.timing(text1Opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(text1TranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);

    const text2Intro = Animated.parallel([
      Animated.timing(text2Opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(text2TranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);

    const text3Intro = Animated.parallel([
      Animated.timing(text3Opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(text3TranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);

    // Master Animation Flow
    Animated.sequence([
      logoIntro,
      Animated.delay(100),
      heartbeatSequence,
      Animated.delay(100),
      text1Intro,
      Animated.delay(150),
      text2Intro,
      Animated.delay(150),
      text3Intro,
    ]).start(() => {
      setIntroFinished(true);
    });

    // Start a continuous subtle loading pulse loop for the background elements or cross
    const loadingLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loadingLoop.start();

    return () => {
      loadingLoop.stop();
    };
  }, [isGentlyLoading]);

  // Handle transition once intro is finished and auth is ready
  useEffect(() => {
    if (introFinished && isReady && onAnimationComplete) {
      // Fade out container
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        onAnimationComplete();
      });
    }
  }, [introFinished, isReady, onAnimationComplete]);

  // Calculate scales and offsets
  const combinedLogoScale = Animated.multiply(logoScale, heartbeatAnim);

  const loaderOpacity = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents={introFinished && isReady ? 'none' : 'auto'}>
      {/* Premium Diagonal Blue to Teal Gradient */}
      <LinearGradient
        colors={['#2563EB', '#14B8A6']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Subtle background glow pulsing in the center */}
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: logoOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.15],
            }),
            transform: [{ scale: loadingPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.2],
            }) }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.logoShell,
          {
            opacity: logoOpacity,
            transform: [{ scale: combinedLogoScale }],
          },
        ]}
      >
        <MedicalLogo size={scaleFont(110)} qColor="#FFFFFF" crossColor="#FFFFFF" />
      </Animated.View>

      <View style={styles.copyContainer}>
        <Animated.View
          style={{
            opacity: text1Opacity,
            transform: [{ translateY: text1TranslateY }],
            alignItems: 'center',
          }}
        >
          <Text style={[styles.title, { fontSize: typography.sizes.xxl + 2 }]}>
            QueueLess
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: text2Opacity,
            transform: [{ translateY: text2TranslateY }],
            alignItems: 'center',
            marginTop: spacing.sm,
          }}
        >
          <Text style={[styles.subtitle, { fontSize: typography.sizes.sm + 1 }]}>
            Smart Healthcare Queue Management
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: text3Opacity,
            transform: [{ translateY: text3TranslateY }],
            alignItems: 'center',
            marginTop: spacing.xs,
          }}
        >
          <Text style={[styles.tagline, { fontSize: typography.sizes.xs + 1 }]}>
            Skip the Waiting Room
          </Text>
        </Animated.View>
      </View>

      {/* Subtle loader if auth takes longer or is gently loading */}
      {!!message && (
        <Animated.View style={[styles.loaderArea, { opacity: loaderOpacity }]}>
          <Text style={styles.loaderText}>
            {message}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  glow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 150,
    height: 300,
    position: 'absolute',
    width: 300,
  },
  logoShell: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  copyContainer: {
    alignItems: 'center',
    marginTop: hp(4),
    paddingHorizontal: wp(10),
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  loaderArea: {
    position: 'absolute',
    bottom: hp(8),
    alignItems: 'center',
  },
  loaderText: {
    color: '#FFFFFF',
    fontSize: scaleFont(13),
    fontWeight: '600',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
});
