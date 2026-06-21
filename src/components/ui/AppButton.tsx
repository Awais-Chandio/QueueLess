import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { hp } from "../../utils/responsive";
import { AnimatedButton } from "../animations/ButtonScale";

interface AppButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const AppButton = ({ onPress, title, loading = false, disabled = false, variant = 'primary', style, textStyle }: AppButtonProps) => {
  const { colors, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary': return { bg: colors.surface, text: colors.text, border: colors.border };
      case 'outline': return { bg: 'transparent', text: colors.primary, border: colors.primary };
      case 'danger': return { bg: colors.error, text: '#FFF', border: colors.error };
      case 'primary':
      default:
        return { bg: colors.primary, text: '#FFF', border: colors.primary };
    }
  };

  const { bg, text, border } = getVariantStyles();

  return (
    <AnimatedButton
      style={[
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginTop: spacing.sm,
          minHeight: hp(5.4),
        },
        isDisabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
    >
      {loading ? (
        <View style={styles.loadingContent}>
          <ActivityIndicator color={text} />
          <Text style={[styles.buttonText, styles.loadingText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
            {title}
          </Text>
        </View>
      ) : (
        <Text style={[styles.buttonText, { color: text, fontSize: typography.sizes.md }, textStyle]}>
          {title}
        </Text>
      )}
    </AnimatedButton>
  );
};

export default AppButton;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
