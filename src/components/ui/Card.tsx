import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'elevated' | 'outlined' | 'flat';
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'elevated', ...props }) => {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: spacing.md,
        },
        variant === 'elevated' && {
          shadowColor: colors.text,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 3,
        },
        variant === 'outlined' && {
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
