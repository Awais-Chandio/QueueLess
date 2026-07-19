import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, StyleProp, ViewStyle } from 'react-native';
import { MapPin, AlertCircle, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import AppButton from './ui/AppButton';
import { scaleFont } from '../utils/responsive';

interface NearbyEmptyStateProps {
  type: 'permission' | 'empty' | 'error';
  onAction: () => void;
  style?: StyleProp<ViewStyle>;
}

export const NearbyEmptyState: React.FC<NearbyEmptyStateProps> = ({ type, onAction, style }) => {
  const { colors, spacing, typography, radius } = useTheme();
  
  // Animations: Fade-in and slide-up
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  // Content configuration based on type
  const config = {
    permission: {
      Icon: ShieldAlert,
      iconColor: colors.warning,
      title: 'Location Permission Required',
      subtitle: 'Location permission is required to find nearby clinics.',
      buttonTitle: 'Allow Location',
    },
    empty: {
      Icon: MapPin,
      iconColor: colors.textSecondary,
      title: 'No Nearby Clinics Found',
      subtitle: "We couldn't find any healthcare centers within 100 km of your current location.",
      buttonTitle: 'Search All Clinics',
    },
    error: {
      Icon: AlertCircle,
      iconColor: colors.error,
      title: 'Unable to load nearby clinics',
      subtitle: 'Failed to connect to the server or resolve your nearby healthcare centers.',
      buttonTitle: 'Retry',
    },
  }[type];

  const { Icon, iconColor, title, subtitle, buttonTitle } = config;

  return (
    <Animated.View style={[styles.container, { padding: spacing.xl, opacity, transform: [{ translateY }] }, style]}>
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: iconColor + '12',
            width: scaleFont(80),
            height: scaleFont(80),
            borderRadius: scaleFont(40),
            marginBottom: spacing.lg,
          },
        ]}
      >
        <Icon size={scaleFont(36)} color={iconColor} />
      </View>

      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: typography.sizes.lg,
            fontWeight: '800',
            marginBottom: spacing.sm,
          },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.subtitle,
          {
            color: colors.textSecondary,
            fontSize: typography.sizes.sm,
            marginBottom: spacing.xl,
            lineHeight: scaleFont(20),
          },
        ]}
      >
        {subtitle}
      </Text>

      <AppButton
        title={buttonTitle}
        onPress={onAction}
        variant="primary"
        style={{ width: '100%', maxWidth: 220 }}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
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
});

export default NearbyEmptyState;
