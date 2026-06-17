import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import AppButton from "./AppButton";
import { LucideIcon } from "lucide-react-native";

type EmptyStateProps = {
  title?: string;
  subtitle?: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
  Icon?: LucideIcon;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, buttonTitle, onButtonPress, Icon }) => {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={[styles.container, { padding: spacing.lg }]}>
      {Icon && (
        <View style={{ marginBottom: spacing.md }}>
          <Icon size={48} color={colors.textSecondary} />
        </View>
      )}
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold }]}>
        {title || "No Data"}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: spacing.lg, marginTop: spacing.sm }]}>
          {subtitle}
        </Text>
      )}

      {buttonTitle && onButtonPress && (
        <View style={[styles.button, { marginTop: spacing.md }]}>
          <AppButton title={buttonTitle} onPress={onButtonPress} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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