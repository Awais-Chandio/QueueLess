import React, { useEffect } from "react";
import { Animated, View, StyleSheet, Text, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import AppButton from "./AppButton";
import { LucideIcon } from "lucide-react-native";
import { scaleFont } from "../../utils/responsive";
import LottieView from 'lottie-react-native';
import BrandIllustration from "./BrandIllustration";

type EmptyStateProps = {
  title?: string;
  subtitle?: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  Icon?: LucideIcon;
  lottieSource?: any;
  illustrationKind?: 'empty' | 'error' | 'success' | 'queue' | 'appointment' | 'notification';
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, buttonTitle, onButtonPress, Icon, lottieSource, illustrationKind = 'empty', style }) => {
  const { colors, spacing, typography } = useTheme();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.container, { padding: spacing.lg, opacity, transform: [{ translateY }] }, style]}>
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
      ) : (
        <View style={{ marginBottom: spacing.lg }}>
          <BrandIllustration kind={illustrationKind} size={scaleFont(150)} />
        </View>
      )}

      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: typography.weights.extrabold, marginBottom: spacing.xs }]}>
        {title || "No Data"}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: spacing.xl, fontSize: typography.sizes.md, lineHeight: scaleFont(23) }]}>
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
  },
  button: {
    width: '100%',
    maxWidth: 300,
  }
});

export default EmptyState;
