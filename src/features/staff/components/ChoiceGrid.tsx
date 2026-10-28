import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';

type Props<T extends string> = {
  options: T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Buttons per row. */
  columns?: number;
  testIDPrefix?: string;
};

/** Big tappable choices (payment method, reason): one selected, filled with the brand colour. */
export function ChoiceGrid<T extends string>({ options, labels, value, onChange, accessibilityLabel, columns = 3, testIDPrefix }: Props<T>) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.grid, { gap: spacing.sm }]}>
      {options.map(option => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            testID={testIDPrefix ? `${testIDPrefix}-${option}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[
              styles.choice,
              {
                flexBasis: `${Math.floor(100 / columns) - 3}%`,
                borderRadius: radius.md,
                paddingHorizontal: spacing.sm,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : colors.surface,
              },
            ]}
          >
            <AppText variant="label" weight="700" numberOfLines={1} style={{ color: selected ? colors.onPrimary : colors.text }}>
              {labels[option]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  choice: { flexGrow: 1, minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
