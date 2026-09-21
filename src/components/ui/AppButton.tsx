import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  type GestureResponderEvent,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success';

export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: AppButtonVariant;
  /** Control height. All three sizes clear the 44pt touch target. */
  size?: AppButtonSize;
  /** Set false to size the button to its label instead of the container. */
  fullWidth?: boolean;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The app's single button.
 *
 * Two things here are deliberate and should not be "fixed" back:
 *
 * 1. The height floor is applied *after* the caller's `style`, so a call site
 *    cannot shrink the control below the 44pt touch target. Screens used to
 *    pass `minHeight: 32` to squeeze a button into a card, which produced
 *    targets a third under the platform minimum.
 * 2. Elevation is neutral. The old button carried a brand-tinted glow
 *    (`shadowColor: '#0F766E'`), which reads as decoration rather than depth.
 */
const AppButton = ({
  onPress,
  title,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  style,
  containerStyle,
  textStyle,
  leftIcon,
  rightIcon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: AppButtonProps) => {
  const { colors, radius, spacing, sizing, shadows, motion, typography } = useTheme();
  const isDisabled = disabled || loading;
  const reducedMotion = useReducedMotion();

  const pressed = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: motion.duration.instant });
  }, [motion.duration.instant, pressed]);

  const handlePressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: motion.duration.fast });
  }, [motion.duration.fast, pressed]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      // Still give feedback, just not movement.
      return { opacity: 1 - pressed.value * 0.2, transform: [{ scale: 1 }] };
    }
    const scale = 1 - pressed.value * (1 - motion.pressScale);
    return { transform: [{ scale }] };
  });

  const tone = useMemo(() => {
    switch (variant) {
      case 'secondary':
        return {
          bg: colors.card,
          text: colors.primary,
          border: colors.primary,
          borderWidth: 1.5,
          gradient: false,
          elevation: shadows.none,
        };
      case 'outline':
        return {
          bg: 'transparent',
          text: colors.primary,
          border: colors.border,
          borderWidth: 1.5,
          gradient: false,
          elevation: shadows.none,
        };
      case 'ghost':
        return {
          bg: 'transparent',
          text: colors.primary,
          border: 'transparent',
          borderWidth: 0,
          gradient: false,
          elevation: shadows.none,
        };
      case 'danger':
        return {
          bg: colors.error,
          text: colors.onError,
          border: colors.error,
          borderWidth: 0,
          gradient: false,
          elevation: shadows.sm,
        };
      case 'success':
        return {
          bg: colors.success,
          text: colors.onPrimary,
          border: colors.success,
          borderWidth: 0,
          gradient: false,
          elevation: shadows.sm,
        };
      case 'primary':
      default:
        return {
          bg: colors.primary,
          text: colors.onPrimary,
          border: colors.primary,
          borderWidth: 0,
          gradient: true,
          elevation: shadows.sm,
        };
    }
  }, [colors, shadows, variant]);

  const height = sizing.control[size];
  const fontSize =
    size === 'sm' ? typography.roles.label.fontSize : typography.roles.subtitle.fontSize;

  const label = (
    <Text
      style={[styles.buttonText, { color: tone.text, fontSize }, textStyle]}
      numberOfLines={1}
    >
      {title}
    </Text>
  );

  const content = (
    <View style={styles.contentContainer}>
      {loading ? (
        <>
          <ActivityIndicator
            size="small"
            color={tone.text}
            style={{ marginRight: spacing.sm }}
          />
          {label}
        </>
      ) : (
        <>
          {leftIcon ? <View style={{ marginRight: spacing.sm }}>{leftIcon}</View> : null}
          {label}
          {rightIcon ? <View style={{ marginLeft: spacing.sm }}>{rightIcon}</View> : null}
        </>
      )}
    </View>
  );

  const surface: ViewStyle[] = [
    styles.button,
    {
      borderRadius: radius.control,
      paddingHorizontal: spacing.lg,
      borderColor: tone.border,
      borderWidth: tone.borderWidth,
    },
    !isDisabled && tone.elevation,
    style as ViewStyle,
    // Applied last on purpose: a call site may restyle the button but may not
    // shrink it below the platform minimum touch target.
    { minHeight: Math.max(height, sizing.minTouch) },
  ].filter(Boolean) as ViewStyle[];

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      testID={testID}
      style={[
        fullWidth ? styles.fullWidth : styles.auto,
        { marginTop: spacing.sm },
        isDisabled && styles.disabled,
        animatedStyle,
        containerStyle,
      ]}
    >
      {tone.gradient && !isDisabled ? (
        <LinearGradient
          colors={colors.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={surface}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[{ backgroundColor: tone.bg }, ...surface]}>{content}</View>
      )}
    </AnimatedPressable>
  );
};

export default AppButton;

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  auto: {
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.45,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
    overflow: 'hidden',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
