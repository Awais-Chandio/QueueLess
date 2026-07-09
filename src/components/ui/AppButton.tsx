import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle, TextStyle, Pressable } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { hp } from "../../utils/responsive";

interface AppButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
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
          bg: colors.card,
          text: colors.primary,
          border: colors.primary,
          borderWidth: 1.5,
          isGradient: false,
        };
      case 'outline':
        return {
          bg: 'transparent',
          text: colors.primary,
          border: colors.primary,
          borderWidth: 1.5,
          isGradient: false,
        };
      case 'danger':
        return {
          bg: colors.error,
          text: '#FFF',
          border: colors.error,
          borderWidth: 0,
          isGradient: false,
        };
      case 'success':
        return {
          bg: colors.success,
          text: '#FFF',
          border: colors.success,
          borderWidth: 0,
          isGradient: false,
        };
      case 'primary':
      default:
        return {
          bg: colors.primary,
          text: '#FFF',
          border: colors.primary,
          borderWidth: 0,
          isGradient: true,
        };
    }
  };

  const { bg, text, border, borderWidth, isGradient } = getVariantStyles();

  const renderContent = () => (
    <View style={styles.contentContainer}>
      {loading ? (
        <>
          <ActivityIndicator size="small" color={text} style={{ marginRight: spacing.sm }} />
          <Text style={[styles.buttonText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
            {title}
          </Text>
        </>
      ) : (
        <>
          {leftIcon && <View style={{ marginRight: spacing.sm }}>{leftIcon}</View>}
          <Text style={[styles.buttonText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
            {title}
          </Text>
          {rightIcon && <View style={{ marginLeft: spacing.sm }}>{rightIcon}</View>}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      style={({ pressed }) => [
        styles.pressable,
        { marginTop: spacing.sm },
        !isDisabled && pressed && styles.pressed,
        containerStyle,
      ]}
    >
      <View style={styles.fullWidth}>
        {isGradient && !isDisabled ? (
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.button,
              {
                borderRadius: radius.xl,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: hp(5.6),
                borderColor: border,
                borderWidth: borderWidth,
              },
              styles.primaryShadow,
              style,
            ]}
          >
            {renderContent()}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.button,
              {
                backgroundColor: bg,
                borderColor: border,
                borderWidth: borderWidth,
                borderRadius: radius.xl,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: hp(5.6),
              },
              variant === 'primary' && !isDisabled && styles.primaryShadow,
              variant === 'danger' && !isDisabled && styles.dangerShadow,
              variant === 'success' && !isDisabled && styles.successShadow,
              isDisabled && styles.disabledButton,
              style,
            ]}
          >
            {renderContent()}
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default AppButton;

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
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
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryShadow: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
  dangerShadow: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 7,
  },
  successShadow: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 7,
  },
});
