import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'elevated' | 'outlined' | 'flat';
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'elevated', ...props }) => {
  const { colors, radius, spacing, isDarkMode } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg, // Use modern radius
          padding: spacing.lg,
        },
        variant === 'elevated' && {
          // Sleek card shadow for iOS
          shadowColor: isDarkMode ? '#000000' : '#0F172A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDarkMode ? 0.4 : 0.04,
          shadowRadius: 16,
          // Subtle border highlight in dark mode
          borderWidth: isDarkMode ? 1 : 0,
          borderColor: colors.border,
          elevation: isDarkMode ? 2 : 4,
        },
        variant === 'outlined' && {
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        variant === 'flat' && {
          backgroundColor: colors.border + '15',
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
