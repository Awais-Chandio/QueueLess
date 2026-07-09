import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import Floating3DLogo from '../../../components/ui/Floating3DLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const { spacing } = useTheme();

  // Animation values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const text1Opacity = useRef(new Animated.Value(0)).current;
  const text1TranslateY = useRef(new Animated.Value(15)).current;
  const text2Opacity = useRef(new Animated.Value(0)).current;
  const text2TranslateY = useRef(new Animated.Value(15)).current;

  // Pulse animation for heartbeat
  const heartbeatAnim = useRef(new Animated.Value(1)).current;
  const loadingPulse = useRef(new Animated.Value(0)).current;

  // Brand signal animation values
  const circle1X = useRef(new Animated.Value(0)).current;
  const circle1Y = useRef(new Animated.Value(0)).current;
  const circle2X = useRef(new Animated.Value(0)).current;
  const circle2Y = useRef(new Animated.Value(0)).current;

  // Particles animations (rising dots)
  const particle1Y = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const particle2Y = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const particle3Y = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const particle4Y = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Track if intro animation sequence has finished
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    // 1. Brand signal animations
    const runCircleAnim = (xVal: Animated.Value, yVal: Animated.Value, xMax: number, yMax: number, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(xVal, {
              toValue: xMax,
              duration: duration,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(yVal, {
              toValue: yMax,
              duration: duration * 1.2,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(xVal, {
              toValue: 0,
              duration: duration,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(yVal, {
              toValue: 0,
              duration: duration * 1.2,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    runCircleAnim(circle1X, circle1Y, wp(15), hp(10), 12000);
    runCircleAnim(circle2X, circle2Y, -wp(20), -hp(8), 15000);

    // 2. Rising Particles Loop
    const runParticleAnim = (yVal: Animated.Value, startDelay: number, startY: number, destY: number, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(startDelay),
          Animated.timing(yVal, {
            toValue: startY,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(yVal, {
            toValue: destY,
            duration: duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    runParticleAnim(particle1Y, 0, SCREEN_HEIGHT, -50, 9000);
    runParticleAnim(particle2Y, 2000, SCREEN_HEIGHT, -50, 11000);
    runParticleAnim(particle3Y, 4500, SCREEN_HEIGHT, -50, 8000);
    runParticleAnim(particle4Y, 6500, SCREEN_HEIGHT, -50, 10000);

    if (isGentlyLoading) {
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      text1Opacity.setValue(1);
      text1TranslateY.setValue(0);
      text2Opacity.setValue(1);
      text2TranslateY.setValue(0);
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

    // Logo intro sequence
    const logoIntro = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]);

    // Heartbeat sequence loop
    const runHeartbeat = () => {
      Animated.sequence([
        Animated.timing(heartbeatAnim, {
          toValue: 1.06,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 0.98,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.04,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Schedule next heartbeat pulse in 1.8 seconds
        setTimeout(runHeartbeat, 1800);
      });
    };

    // Text fading sequences
    const text1Intro = Animated.parallel([
      Animated.timing(text1Opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(text1TranslateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);

    const text2Intro = Animated.parallel([
      Animated.timing(text2Opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(text2TranslateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);

    // Master Timeline (Duration is approx 2 seconds)
    // 0ms: Logo intro
    // 400ms: Heartbeat pulse begins, title fades
    // 800ms: Tagline fades
    // 2000ms: Intro finished
    Animated.sequence([
      logoIntro,
      Animated.delay(100),
      text1Intro,
      Animated.delay(300),
      text2Intro,
      Animated.delay(800),
    ]).start(() => {
      setIntroFinished(true);
    });

    // Start heartbeat pulse loop
    runHeartbeat();

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
  }, [
    circle1X,
    circle1Y,
    circle2X,
    circle2Y,
    containerOpacity,
    heartbeatAnim,
    isGentlyLoading,
    loadingPulse,
    logoOpacity,
    logoScale,
    particle1Y,
    particle2Y,
    particle3Y,
    particle4Y,
    text1Opacity,
    text1TranslateY,
    text2Opacity,
    text2TranslateY,
  ]);

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
  }, [containerOpacity, introFinished, isReady, onAnimationComplete]);

  // Calculate scales and offsets
  const combinedLogoScale = Animated.multiply(logoScale, heartbeatAnim);

  const loaderOpacity = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents={introFinished && isReady ? 'none' : 'auto'}>
      {/* QueueLess clinical gradient */}
      <LinearGradient
        colors={['#115E59', '#0F766E', '#14B8A6']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Brand signal field */}
      <Animated.View
        style={[
          styles.signalField,
          {
            opacity: logoOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.42],
            }),
            transform: [{ translateX: circle1X }],
          },
        ]}
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`} fill="none">
          <Path
            d={`M${wp(8)} ${hp(28)} C${wp(28)} ${hp(21)} ${wp(42)} ${hp(35)} ${wp(58)} ${hp(28)} S${wp(86)} ${hp(25)} ${wp(94)} ${hp(30)}`}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d={`M${wp(12)} ${hp(66)} H${wp(28)} L${wp(34)} ${hp(58)} L${wp(42)} ${hp(74)} L${wp(50)} ${hp(47)} L${wp(58)} ${hp(66)} H${wp(86)}`}
            stroke="rgba(147,197,253,0.62)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={wp(18)} cy={hp(66)} r="4" fill="rgba(255,255,255,0.75)" />
          <Circle cx={wp(86)} cy={hp(66)} r="4" fill="rgba(255,255,255,0.75)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.signalField,
          {
            opacity: 0.18,
            transform: [{ translateY: circle2Y }],
          },
        ]}
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`} fill="none">
          <Path
            d={`M${wp(14)} ${hp(18)} H${wp(34)} M${wp(66)} ${hp(18)} H${wp(86)} M${wp(20)} ${hp(82)} H${wp(42)} M${wp(60)} ${hp(82)} H${wp(84)}`}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Circle cx={wp(34)} cy={hp(18)} r="3" fill="rgba(147,197,253,0.9)" />
          <Circle cx={wp(60)} cy={hp(82)} r="3" fill="rgba(147,197,253,0.9)" />
        </Svg>
      </Animated.View>

      {/* Light Particles */}
      <Animated.View style={[styles.particle, { left: wp(15), transform: [{ translateY: particle1Y }] }]} />
      <Animated.View style={[styles.particle, { left: wp(45), width: 6, height: 6, opacity: 0.2, transform: [{ translateY: particle2Y }] }]} />
      <Animated.View style={[styles.particle, { left: wp(70), width: 5, height: 5, opacity: 0.35, transform: [{ translateY: particle3Y }] }]} />
      <Animated.View style={[styles.particle, { left: wp(85), transform: [{ translateY: particle4Y }] }]} />

      {/* Soft Glow behind logo */}
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: logoOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.25],
            }),
            transform: [{
              scale: loadingPulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.25],
              })
            }],
          },
        ]}
      />

      {/* Logo Container */}
      <Animated.View
        style={[
          styles.logoShell,
          {
            opacity: logoOpacity,
            transform: [{ scale: combinedLogoScale }],
          },
        ]}
      >
        <Floating3DLogo size={scaleFont(104)} qColor="#FFFFFF" crossColor="#A7F3D0" />
      </Animated.View>

      {/* Typography Content */}
      <View style={styles.copyContainer}>
        <Animated.View
          style={{
            opacity: text1Opacity,
            transform: [{ translateY: text1TranslateY }],
            alignItems: 'center',
          }}
        >
          <Text style={[styles.title, { fontSize: scaleFont(34) }]}>
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
          <Text style={[styles.tagline, { fontSize: scaleFont(14) }]}>
            Care starts before the waiting room.
          </Text>
        </Animated.View>
      </View>

      {/* Loader text */}
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
  signalField: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(147, 197, 253, 0.72)',
    borderRadius: 125,
    height: 250,
    width: 250,
    opacity: 0.15,
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
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
});
