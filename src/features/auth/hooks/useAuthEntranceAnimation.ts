import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * The fade + slide-up + logo-pop entrance every auth screen (Login, Signup,
 * PhoneLogin, OTP, ForgotPassword) plays on mount. It was copy-pasted into
 * each screen with identical timings; centralising it means a timing change
 * only happens once, and a new auth screen gets it for free.
 */
export function useAuthEntranceAnimation() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 30,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, logoScale, slideAnim]);

  return { fadeAnim, slideAnim, logoScale };
}

export default useAuthEntranceAnimation;
