import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import type { AppointmentStatus } from '../../types/appointment';
import type { StatusPalette } from '../../theme/colors';
import { scaleFont } from '../../utils/responsive';
import { useTheme } from '../../hooks/useTheme';

/**
 * The status colour ramp used to live here as a 17-entry map of raw hex pairs.
 * It now comes from `colors.status`, so a status means the same thing whether
 * it is rendered as a chip, a row accent, or a queue banner.
 *
 * The dot is not decoration: status is never communicated by colour alone, so
 * the chip always pairs the hue with a readable label.
 */
export type StatusChipVariant = AppointmentStatus | keyof StatusPalette;

interface StatusChipProps {
  status: StatusChipVariant;
  label?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  style,
  textStyle,
  size = 'md',
}) => {
  const { colors, radius, isDarkMode } = useTheme();
  const tone = colors.status[status as keyof StatusPalette] ?? colors.status.default;

  const dotSize = size === 'sm' ? scaleFont(6) : scaleFont(7);
  const fontSize = size === 'sm' ? scaleFont(11) : scaleFont(12);
  const px = size === 'sm' ? scaleFont(8) : scaleFont(10);
  const py = size === 'sm' ? scaleFont(3) : scaleFont(4);

  const resolvedLabel = label ?? tone.label;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${resolvedLabel}`}
      style={[
        styles.container,
        {
          backgroundColor: tone.bg,
          paddingHorizontal: px,
          paddingVertical: py,
          borderRadius: radius.pill,
          borderColor: tone.dot + (isDarkMode ? '40' : '20'),
          borderWidth: 1,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: tone.dot,
          },
        ]}
      />
      <Text
        style={[styles.label, { color: tone.fg, fontSize }, textStyle]}
        numberOfLines={1}
      >
        {resolvedLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: scaleFont(6),
  },
  dot: {},
  label: {
    fontWeight: '600',
  },
});

export default StatusChip;
