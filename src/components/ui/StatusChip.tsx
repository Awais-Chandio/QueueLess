import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import type { AppointmentStatus } from '../../types/appointment';
import { scaleFont } from '../../utils/responsive';
import { useTheme } from '../../hooks/useTheme';

export type StatusChipVariant =
  | AppointmentStatus
  | 'all'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'default';

interface StatusConfig {
  bgLight: string;
  bgDark: string;
  dot: string;
  textLight: string;
  textDark: string;
  label: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  pending: {
    bgLight: '#F59E0B10',
    bgDark: '#F59E0B24',
    dot: '#F59E0B',
    textLight: '#92400E',
    textDark: '#FBBF24',
    label: 'Pending',
  },
  confirmed: {
    bgLight: '#0E749012',
    bgDark: '#0891B224',
    dot: '#0E7490',
    textLight: '#155E75',
    textDark: '#67E8F9',
    label: 'Confirmed',
  },
  called: {
    bgLight: '#3B82F612',
    bgDark: '#3B82F624',
    dot: '#3B82F6',
    textLight: '#075985',
    textDark: '#93C5FD',
    label: 'Called',
  },
  in_progress: {
    bgLight: '#3B82F612',
    bgDark: '#3B82F624',
    dot: '#3B82F6',
    textLight: '#075985',
    textDark: '#93C5FD',
    label: 'In Progress',
  },
  completed: {
    bgLight: '#0E749012',
    bgDark: '#0891B224',
    dot: '#0E7490',
    textLight: '#155E75',
    textDark: '#67E8F9',
    label: 'Completed',
  },
  cancelled: {
    bgLight: '#EF444412',
    bgDark: '#EF444424',
    dot: '#EF4444',
    textLight: '#991B1B',
    textDark: '#FECACA',
    label: 'Cancelled',
  },
  checked_in: {
    bgLight: '#0E749012',
    bgDark: '#0891B224',
    dot: '#0E7490',
    textLight: '#155E75',
    textDark: '#67E8F9',
    label: 'Checked In',
  },
  expired: {
    bgLight: '#6B728010',
    bgDark: '#6B728020',
    dot: '#6B7280',
    textLight: '#374151',
    textDark: '#D1D5DB',
    label: 'Expired',
  },
  no_show: {
    bgLight: '#EF444412',
    bgDark: '#EF444424',
    dot: '#EF4444',
    textLight: '#991B1B',
    textDark: '#FECACA',
    label: 'No Show',
  },
  success: {
    bgLight: '#0E749012',
    bgDark: '#0891B224',
    dot: '#0E7490',
    textLight: '#155E75',
    textDark: '#67E8F9',
    label: 'Success',
  },
  warning: {
    bgLight: '#F59E0B10',
    bgDark: '#F59E0B20',
    dot: '#F59E0B',
    textLight: '#B45309',
    textDark: '#FBBF24',
    label: 'Warning',
  },
  error: {
    bgLight: '#EF444412',
    bgDark: '#EF444424',
    dot: '#EF4444',
    textLight: '#991B1B',
    textDark: '#FECACA',
    label: 'Error',
  },
  info: {
    bgLight: '#3B82F612',
    bgDark: '#3B82F624',
    dot: '#3B82F6',
    textLight: '#075985',
    textDark: '#93C5FD',
    label: 'Info',
  },
  default: {
    bgLight: '#94A3B810',
    bgDark: '#94A3B820',
    dot: '#94A3B8',
    textLight: '#475569',
    textDark: '#CBD5E1',
    label: 'Unknown',
  },
  all: {
    bgLight: '#0E749012',
    bgDark: '#0891B224',
    dot: '#0E7490',
    textLight: '#155E75',
    textDark: '#67E8F9',
    label: 'All',
  },
};

interface StatusChipProps {
  status: StatusChipVariant;
  label?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  style,
  size = 'md',
}) => {
  const { isDarkMode } = useTheme();
  const config = STATUS_MAP[status] ?? STATUS_MAP.default;

  const dotSize = size === 'sm' ? scaleFont(6) : scaleFont(7);
  const fontSize = size === 'sm' ? scaleFont(11) : scaleFont(12);
  const px = size === 'sm' ? scaleFont(8) : scaleFont(10);
  const py = size === 'sm' ? scaleFont(3) : scaleFont(4);

  const bg = isDarkMode ? config.bgDark : config.bgLight;
  const textColor = isDarkMode ? config.textDark : config.textLight;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          paddingHorizontal: px,
          paddingVertical: py,
          borderRadius: 999,
          borderColor: config.dot + (isDarkMode ? '40' : '20'),
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
            color: textColor,
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
    gap: scaleFont(6),
  },
  dot: {},
  label: {
    fontWeight: '600',
  },
});

export default StatusChip;
