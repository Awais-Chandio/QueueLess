import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'teal' | 'emerald' | 'default';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'default', style, textStyle }) => {
  const { colors, radius, spacing, typography, isDarkMode } = useTheme();

  const getVariantStyles = () => {
    // Opacity changes based on dark or light mode
    const opacityHex = isDarkMode ? '32' : '18';
    switch (variant) {
      case 'success':
        return {
          bg: colors.success + opacityHex,
          text: colors.success,
          border: colors.success + '30',
        };
      case 'warning':
        return {
          bg: colors.warning + opacityHex,
          text: colors.warning,
          border: colors.warning + '30',
        };
      case 'error':
        return {
          bg: colors.error + opacityHex,
          text: colors.error,
          border: colors.error + '30',
        };
      case 'info':
        return {
          bg: colors.info + opacityHex,
          text: colors.info,
          border: colors.info + '30',
        };
      case 'teal':
        return {
          bg: colors.primary + opacityHex,
          text: colors.primary,
          border: colors.primary + '30',
        };
      case 'emerald':
        return {
          bg: colors.success + opacityHex,
          text: colors.success,
          border: colors.success + '30',
        };
      default:
        return {
          bg: isDarkMode ? colors.primaryLight : colors.primary + '10',
          text: colors.textSecondary,
          border: colors.border,
        };
    }
  };

  const { bg, text, border } = getVariantStyles();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: radius.full,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs / 2,
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            color: text,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export default Badge;
