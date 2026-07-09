import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  FlatList,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar, Clock, Bell, Stethoscope, Heart } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import type { AuthStackParamList } from '../../../navigation/AuthNavigator';
import AppButton from '../../../components/ui/AppButton';
import BookAppointmentAnimation from '../../../components/animations/BookAppointmentAnimation';
import QueueTrackingAnimation from '../../../components/animations/QueueTrackingAnimation';
import RealtimeNotificationAnimation from '../../../components/animations/RealtimeNotificationAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type OnboardingScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface OnboardingPage {
  id: string;
  title: string;
  subtitle: string;
}

const PAGES: OnboardingPage[] = [
  {
    id: '1',
    title: 'Book Appointments',
    subtitle: 'Schedule visits with top specialists without hassle.',
  },
  {
    id: '2',
    title: 'Track Live Queue',
    subtitle: 'See your position in real-time and know exactly when to arrive.',
  },
  {
    id: '3',
    title: 'Get Instant Notifications',
    subtitle: 'Receive instant updates about your turn and delay alerts.',
  },
];

const AnimatedDot = ({ active, colors }: { active: boolean; colors: any }) => {
  const widthVal = useRef(new Animated.Value(active ? wp(6) : wp(2))).current;
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(widthVal, {
        toValue: active ? wp(6) : wp(2),
        friction: 7,
        tension: 80,
        useNativeDriver: false,
      }),
      Animated.spring(progress, {
        toValue: active ? 1 : 0,
        friction: 7,
        tension: 80,
        useNativeDriver: false,
      }),
    ]).start();
  }, [active, progress, widthVal]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.disabled, colors.primary],
  });

  return <Animated.View style={[styles.dot, { width: widthVal, backgroundColor }]} />;
};

export const OnboardingScreen = () => {
  const { colors, typography, isDarkMode } = useTheme();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Floating background icons animated values
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Check if onboarding completed already
    const checkStatus = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem('HAS_COMPLETED_ONBOARDING');
        if (hasSeen === 'true') {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' as any }],
          });
        } else {
          setCheckingOnboarding(false);
        }
      } catch {
        setCheckingOnboarding(false);
      }
    };
    checkStatus();

    // Start background drift animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim, navigation]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleNext = async () => {
    if (currentIndex < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      setCurrentIndex(currentIndex + 1);
    } else {
      await finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('HAS_COMPLETED_ONBOARDING', 'true');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' as any }],
      });
    } catch {
      navigation.navigate('Login' as any);
    }
  };

  const getFloatingStyle = (multiplierX: number, multiplierY: number) => {
    return {
      transform: [
        {
          translateX: floatAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, multiplierX],
          }),
        },
        {
          translateY: floatAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, multiplierY],
          }),
        },
      ],
    };
  };

  if (checkingOnboarding) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Dynamic medical background gradient */}
      <LinearGradient
        colors={isDarkMode ? ['#1e3a8a', '#0f766e'] : ['#eff6ff', '#e6fdf9']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Floating Medical Icons in Background */}
      <Animated.View style={[styles.floatingIcon, { top: hp(8), left: wp(10), opacity: 0.15 }, getFloatingStyle(8, -12)]}>
        <Calendar size={scaleFont(32)} color={colors.primary} />
      </Animated.View>
      <Animated.View style={[styles.floatingIcon, { top: hp(25), right: wp(8), opacity: 0.12 }, getFloatingStyle(-10, 8)]}>
        <Clock size={scaleFont(28)} color={colors.info} />
      </Animated.View>
      <Animated.View style={[styles.floatingIcon, { top: hp(45), left: wp(5), opacity: 0.15 }, getFloatingStyle(6, 10)]}>
        <Bell size={scaleFont(30)} color={colors.primary} />
      </Animated.View>
      <Animated.View style={[styles.floatingIcon, { top: hp(65), right: wp(12), opacity: 0.1 }, getFloatingStyle(-8, -6)]}>
        <Stethoscope size={scaleFont(34)} color={colors.success} />
      </Animated.View>
      <Animated.View style={[styles.floatingIcon, { bottom: hp(15), left: wp(15), opacity: 0.12 }, getFloatingStyle(5, 5)]}>
        <Heart size={scaleFont(26)} color={colors.error} />
      </Animated.View>

      {/* Skip Button */}
      {currentIndex < PAGES.length - 1 && (
        <Pressable style={styles.skipButton} onPress={finishOnboarding}>
          <Text style={[styles.skipText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Skip</Text>
        </Pressable>
      )}

      {/* Tutorial List */}
      <FlatList
        ref={flatListRef}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.pageContainer}>
            <View style={styles.illustrationWrapper}>
              {item.id === '1' && <BookAppointmentAnimation />}
              {item.id === '2' && <QueueTrackingAnimation />}
              {item.id === '3' && <RealtimeNotificationAnimation />}
            </View>
            <View style={styles.textWrapper}>
              <Text style={[styles.title, { color: colors.text, fontSize: scaleFont(26) }]}>{item.title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: scaleFont(15) }]}>{item.subtitle}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom controls */}
      <View style={styles.footerContainer}>
        {/* Page Indicators */}
        <View style={styles.indicatorContainer}>
          {PAGES.map((_, i) => (
            <AnimatedDot key={i} active={i === currentIndex} colors={colors} />
          ))}
        </View>

        {/* Action Button */}
        <AppButton
          title={currentIndex === PAGES.length - 1 ? 'Get Started' : 'Next'}
          onPress={handleNext}
          containerStyle={styles.actionButton}
        />
      </View>
    </View>
  );
};

export default OnboardingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingIcon: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  skipButton: {
    position: 'absolute',
    top: hp(6),
    right: wp(6),
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pageContainer: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(8),
  },
  illustrationWrapper: {
    height: hp(45),
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustration: {
    width: '100%',
    height: '90%',
  },
  textWrapper: {
    marginTop: hp(2),
    alignItems: 'center',
  },
  title: {
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: hp(1.5),
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: scaleFont(22),
    paddingHorizontal: wp(4),
  },
  footerContainer: {
    paddingHorizontal: wp(8),
    paddingBottom: hp(6),
    alignItems: 'center',
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(4),
  },
  dot: {
    height: hp(1),
    borderRadius: hp(0.5),
    marginHorizontal: 4,
  },
  actionButton: {
    width: '100%',
    height: hp(6.5),
  },
});
