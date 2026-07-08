import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle, TextStyle, Pressable } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "../../hooks/useTheme";
import { hp, scaleFont } from "../../utils/responsive";

interface AppButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  style?: ViewStyle;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const AppButton = ({
  onPress,
  title,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  containerStyle,
  textStyle,
  leftIcon,
  rightIcon,
}: AppButtonProps) => {
  const { colors, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          bg: colors.border + '30',
          text: colors.text,
          border: colors.border,
          borderWidth: 1,
        };
      case 'outline':
        return {
          bg: 'transparent',
          text: colors.primary,
          border: colors.primary,
          borderWidth: 1.5,
        };
      case 'danger':
        return {
          bg: colors.error,
          text: '#FFF',
          border: colors.error,
          borderWidth: 0,
        };
      case 'primary':
      default:
        return {
          bg: colors.primary,
          text: '#FFF',
          border: colors.primary,
          borderWidth: 0,
        };
    }
  };

  const { bg, text, border, borderWidth } = getVariantStyles();

  // Reanimated press scale animation
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (!isDisabled) {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 200 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      style={[{ width: '100%', marginTop: spacing.sm }, containerStyle]}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: bg,
            borderColor: border,
            borderWidth: borderWidth,
            borderRadius: radius.xl, // Premium rounded pills style
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minHeight: hp(5.6),
          },
          isDisabled && styles.disabledButton,
          style,
          animatedStyle,
        ]}
      >
        {loading ? (
          <View style={styles.contentContainer}>
            <ActivityIndicator size="small" color={text} style={{ marginRight: spacing.sm }} />
            <Text style={[styles.buttonText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
              {title}
            </Text>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            {leftIcon && <View style={{ marginRight: spacing.sm }}>{leftIcon}</View>}
            <Text style={[styles.buttonText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
              {title}
            </Text>
            {rightIcon && <View style={{ marginLeft: spacing.sm }}>{rightIcon}</View>}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

export default AppButton;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    flexDirection: 'row',
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
  disabledButton: {
    opacity: 0.6,
  },
});
