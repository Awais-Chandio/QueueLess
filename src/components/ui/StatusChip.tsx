import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import type { AppointmentStatus } from '../../types/appointment';
import { scaleFont } from '../../utils/responsive';

export type StatusChipVariant =
  | AppointmentStatus
  | 'all'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'default';

interface StatusConfig {
  bg: string;
  dot: string;
  text: string;
  label: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  pending: {
    bg: '#F59E0B18',
    dot: '#F59E0B',
    text: '#B45309',
    label: 'Pending',
  },
  confirmed: {
    bg: '#2E7DFF18',
    dot: '#2E7DFF',
    text: '#1565C0',
    label: 'Confirmed',
  },
  called: {
    bg: '#8B5CF618',
    dot: '#8B5CF6',
    text: '#6D28D9',
    label: 'Called',
  },
  in_progress: {
    bg: '#8B5CF618',
    dot: '#8B5CF6',
    text: '#6D28D9',
    label: 'In Progress',
  },
  completed: {
    bg: '#22C55E18',
    dot: '#22C55E',
    text: '#15803D',
    label: 'Completed',
  },
  cancelled: {
    bg: '#EF444418',
    dot: '#EF4444',
    text: '#B91C1C',
    label: 'Cancelled',
  },
  checked_in: {
    bg: '#3B82F618',
    dot: '#3B82F6',
    text: '#1D4ED8',
    label: 'Checked In',
  },
  expired: {
    bg: '#EF444418',
    dot: '#EF4444',
    text: '#B91C1C',
    label: 'Expired',
  },
  no_show: {
    bg: '#EF444418',
    dot: '#EF4444',
    text: '#B91C1C',
    label: 'No Show',
  },
  // Generic variants for convenience
  success: {
    bg: '#22C55E18',
    dot: '#22C55E',
    text: '#15803D',
    label: 'Success',
  },
  warning: {
    bg: '#F59E0B18',
    dot: '#F59E0B',
    text: '#B45309',
    label: 'Warning',
  },
  error: {
    bg: '#EF444418',
    dot: '#EF4444',
    text: '#B91C1C',
    label: 'Error',
  },
  info: {
    bg: '#3B82F618',
    dot: '#3B82F6',
    text: '#1D4ED8',
    label: 'Info',
  },
  default: {
    bg: '#94A3B818',
    dot: '#94A3B8',
    text: '#64748B',
    label: 'Unknown',
  },
  all: {
    bg: '#2E7DFF18',
    dot: '#2E7DFF',
    text: '#1565C0',
    label: 'All',
  },
};

interface StatusChipProps {
  status: StatusChipVariant;
  /** Override the display label. If omitted, uses the built-in label from STATUS_MAP. */
  label?: string;
  style?: ViewStyle;
  /** Size variant — 'sm' for compact filter chips, 'md' for card badges */
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  style,
  size = 'md',
}) => {
  const config = STATUS_MAP[status] ?? STATUS_MAP.default;
  const dotSize = size === 'sm' ? scaleFont(6) : scaleFont(7);
  const fontSize = size === 'sm' ? scaleFont(11) : scaleFont(12);
  const px = size === 'sm' ? scaleFont(8) : scaleFont(10);
  const py = size === 'sm' ? scaleFont(3) : scaleFont(4);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.bg,
          paddingHorizontal: px,
          paddingVertical: py,
          borderRadius: 999,
          borderColor: config.dot + '40',
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
            backgroundColor: config.dot,
          },
        ]}
      />
      <Text
        style={[
          styles.label,
          {
            color: config.text,
            fontSize,
          },
        ]}
        numberOfLines={1}
      >
        {label ?? config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: scaleFont(5),
  },
  dot: {},
  label: {
    fontWeight: '600',
  },
});

export default StatusChip;
