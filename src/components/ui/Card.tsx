import React from 'react';
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle, Pressable } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'elevated' | 'outlined' | 'flat' | 'gradient';
  onPress?: () => void;
  disabled?: boolean;
  gradientColors?: string[];
  containerStyle?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'elevated',
  onPress,
  disabled = false,
  gradientColors,
  containerStyle,
  ...props
}) => {
  const { colors, radius, spacing, isDarkMode } = useTheme();

  const resolvedColors = gradientColors || colors.gradients.card;

  const renderCardBody = () => {
    if (variant === 'gradient') {
      return (
        <LinearGradient
          colors={resolvedColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.cardBody,
            {
              borderRadius: radius.lg,
              padding: spacing.lg,
            },
            style,
          ]}
        >
          {children}
        </LinearGradient>
      );
    }

    return (
      <View
        style={[
          styles.cardBody,
          {
            backgroundColor: colors.card,
            borderRadius: radius.xl,
            padding: spacing.lg,
          },
          variant === 'elevated' && {
            shadowColor: isDarkMode ? '#000000' : '#0F766E',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDarkMode ? 0.35 : 0.05,
            shadowRadius: 16,
            borderWidth: 1,
            borderColor: isDarkMode ? colors.border : 'rgba(15, 118, 110, 0.08)',
            elevation: isDarkMode ? 4 : 2,
          },
          variant === 'outlined' && {
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            backgroundColor: colors.card,
          },
          variant === 'flat' && {
            backgroundColor: colors.primaryLight,
          },
          style,
        ]}
      >
        {variant === 'elevated' && !isDarkMode ? (
          <LinearGradient
            colors={['rgba(20, 184, 166, 0.20)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topHighlight}
          />
        ) : null}
        {children}
      </View>
    );
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.pressable,
          !disabled && pressed && styles.pressed,
          containerStyle,
        ]}
      >
        {renderCardBody()}
      </Pressable>
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
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  card: {
    overflow: 'visible',
  },
  cardBody: {
    overflow: 'hidden',
    position: 'relative',
  },
  topHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
  },
});

export default Card;
