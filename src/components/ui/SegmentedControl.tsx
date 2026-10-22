import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import AppText from './AppText';

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** A row of mutually exclusive choices (2-4 short labels). */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, style }: Props<T>) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.row, { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill, padding: 3 }, style]}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              {
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm,
                backgroundColor: selected ? colors.surface : 'transparent',
              },
            ]}
          >
            <AppText variant="caption" weight={selected ? '700' : '500'} tone={selected ? 'brand' : 'secondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  segment: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SegmentedControl;
