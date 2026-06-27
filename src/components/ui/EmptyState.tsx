import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Text, Animated } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import AppButton from "./AppButton";
import { LucideIcon } from "lucide-react-native";
import { scaleFont } from "../../utils/responsive";

type EmptyStateProps = {
  title?: string;
  subtitle?: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  Icon?: LucideIcon;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, buttonTitle, onButtonPress, Icon }) => {
  const { colors, spacing, typography } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.container, { padding: spacing.lg, opacity, transform: [{ translateY }] }]}>
      {Icon && (
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colors.primary + '12',
              marginBottom: spacing.md,
              width: scaleFont(80),
              height: scaleFont(80),
              borderRadius: scaleFont(40),
            },
          ]}
        >
          <Icon size={scaleFont(36)} color={colors.primary + '80'} />
        </View>
      )}
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold }]}>
        {title || "No Data"}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: spacing.lg, marginTop: spacing.sm, fontSize: typography.sizes.sm }]}>
          {subtitle}
        </Text>
      )}

      {buttonTitle && onButtonPress && (
        <View style={[styles.button, { marginTop: spacing.md }]}>
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
  },
  button: {
    width: '100%'
  }
});

export default EmptyState;
