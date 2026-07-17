import React from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface IconButtonProps {
  onPress: () => void;
  icon: any; // Lucide icon
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: React.FC<IconButtonProps> = ({
  onPress,
  icon: IconComponent,
  color,
  size = 20,
  disabled = false,
  style,
}) => {
  const { colors, spacing, radius } = useTheme();
  const scale = useSharedValue(1);

  const activeColor = color || colors.text;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.92, { damping: 10, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        {
          borderColor: colors.border,
          borderWidth: 1.2,
          backgroundColor: colors.surface,
          padding: spacing.sm,
          borderRadius: radius.md,
        },
        disabled && styles.disabled,
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      <Animated.View style={animatedStyle}>
        <IconComponent size={scaleFont(size)} color={activeColor} />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default IconButton;
