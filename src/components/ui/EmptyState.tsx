import React, { useEffect } from "react";
import { View, StyleSheet, Text, StyleProp, ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useTheme } from "../../hooks/useTheme";
import AppButton from "./AppButton";
import { LucideIcon } from "lucide-react-native";
import { scaleFont } from "../../utils/responsive";
import LottieView from 'lottie-react-native';

type EmptyStateProps = {
  title?: string;
  subtitle?: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  Icon?: LucideIcon;
  lottieSource?: any;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, buttonTitle, onButtonPress, Icon, lottieSource, style }) => {
  const { colors, spacing, typography } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) });
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View style={[styles.container, { padding: spacing.lg }, animatedStyle, style]}>
      {lottieSource ? (
        <LottieView
          source={lottieSource}
          autoPlay
          loop
          style={{ width: scaleFont(160), height: scaleFont(160), marginBottom: spacing.lg }}
        />
      ) : Icon ? (
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colors.primary + '12',
              marginBottom: spacing.lg,
              width: scaleFont(80),
              height: scaleFont(80),
              borderRadius: scaleFont(40),
            },
          ]}
        >
          <Icon size={scaleFont(36)} color={colors.primary} />
        </View>
      ) : null}

      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, marginBottom: spacing.xs }]}>
        {title || "No Data"}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: spacing.xl, fontSize: typography.sizes.md }]}>
          {subtitle}
        </Text>
      )}

      {buttonTitle && onButtonPress && (
        <View style={styles.button}>
          <AppButton title={buttonTitle} onPress={onButtonPress} />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 24,
  },
  button: {
    width: '100%',
    maxWidth: 300,
  }
});

export default EmptyState;
