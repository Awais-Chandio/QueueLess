import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'default', style, textStyle }) => {
  const { colors, radius, spacing, typography } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'success': return { bg: colors.success + '20', text: colors.success };
      case 'warning': return { bg: colors.warning + '20', text: colors.warning };
      case 'error': return { bg: colors.error + '20', text: colors.error };
      case 'info': return { bg: colors.info + '20', text: colors.info };
      default: return { bg: colors.border, text: colors.textSecondary };
    }
  };

  const { bg, text } = getVariantStyles();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
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
            fontWeight: typography.weights.medium,
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
