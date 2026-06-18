import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Clock3 } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont } from '../../../utils/responsive';

const SplashScreen = () => {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.logo,
          {
            backgroundColor: colors.primary,
            borderRadius: radius.xl,
            marginBottom: spacing.xl,
          },
        ]}
      >
        <Clock3 color="#FFFFFF" size={scaleFont(42)} strokeWidth={2.4} />
      </View>

      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: typography.sizes.xxl,
          },
        ]}
      >
        QueueLess
      </Text>
      <Text
        style={[
          styles.subtitle,
          {
            color: colors.textSecondary,
            fontSize: typography.sizes.sm,
            marginTop: spacing.sm,
          },
        ]}
      >
        Smart queue management
      </Text>

      <ActivityIndicator
        color={colors.primary}
        size="large"
        style={{ marginTop: spacing.xxl }}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typography.sizes.xs,
          marginTop: spacing.md,
        }}
      >
        Preparing your experience...
      </Text>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    alignItems: 'center',
    height: scaleFont(88),
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    width: scaleFont(88),
    elevation: 8,
  },
  subtitle: {
    textAlign: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
