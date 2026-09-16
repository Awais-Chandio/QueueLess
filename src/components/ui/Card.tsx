import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  ViewProps,
  StyleProp,
  ViewStyle,
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

export type CardVariant = 'elevated' | 'outlined' | 'flat' | 'gradient';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  gradientColors?: string[];
  containerStyle?: StyleProp<ViewStyle>;
  /** Padding preset. `none` lets a card hold a full-bleed image or its own rows. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  accessibilityLabel?: string;
}

/**
 * The app's card surface.
 *
 * The previous version painted a teal gradient hairline across the top of every
 * elevated card and cast a brand-tinted shadow beneath it. Both were decoration
 * applied uniformly, which flattened the hierarchy — everything looked equally
 * important — and pushed the app toward a consumer look. A card now separates
 * itself with a hairline border and a neutral, restrained shadow, so emphasis
 * comes from what a card *contains* rather than from its frame.
 */
export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'elevated',
  onPress,
  disabled = false,
  gradientColors,
  containerStyle,
  padding = 'md',
  accessibilityLabel,
  ...props
}) => {
  const { colors, radius, spacing, shadows, motion, isDarkMode } = useTheme();
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
      return { opacity: 1 - pressed.value * 0.15, transform: [{ scale: 1 }] };
    }
    return { transform: [{ scale: 1 - pressed.value * (1 - motion.pressScale) }] };
  });

  // `md` is the default and matches the 16pt padding cards had before the
  // redesign, so adopting the preset does not silently reflow existing screens.
  const pad =
    padding === 'none'
      ? 0
      : padding === 'sm'
      ? spacing.md
      : padding === 'md'
      ? spacing.lg
      : spacing.xl;

  const base: ViewStyle = {
    borderRadius: radius.card,
    padding: pad,
  };

  const renderCardBody = () => {
    if (variant === 'gradient') {
      return (
        <LinearGradient
          colors={gradientColors ?? colors.gradients.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardBody, base, style]}
        >
          {children}
        </LinearGradient>
      );
    }

    return (
      <View
        style={[
          styles.cardBody,
          base,
          { backgroundColor: colors.card },
          variant === 'elevated' && {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            ...shadows.sm,
          },
          variant === 'outlined' && {
            borderWidth: 1,
            borderColor: colors.border,
          },
          variant === 'flat' && {
            backgroundColor: isDarkMode ? colors.surfaceSunken : colors.surfaceSunken,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={[styles.pressable, disabled && styles.disabled, animatedStyle, containerStyle]}
      >
        {renderCardBody()}
      </AnimatedPressable>
    );
  }

  return (
    <View style={[styles.card, containerStyle]} {...props}>
      {renderCardBody()}
    </View>
  );
};

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  card: {
    overflow: 'visible',
  },
  cardBody: {
    overflow: 'hidden',
    position: 'relative',
  },
});

export default Card;
