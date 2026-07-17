import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { DoctorAvailabilityStatus } from '../types/doctor';

interface AvailabilityBadgeProps {
  status: DoctorAvailabilityStatus;
}

export const AvailabilityBadge: React.FC<AvailabilityBadgeProps> = ({ status }) => {
  const { colors, radius, spacing, typography } = useTheme();

  const STATUS_MAP: Record<DoctorAvailabilityStatus, { label: string; color: string; bgColor: string }> = {
    available: {
      label: 'Available',
      color: colors.success,
      bgColor: colors.success + '15',
    },
    busy: {
      label: 'Busy · Long Queue',
      color: colors.warning,
      bgColor: colors.warning + '15',
    },
    on_break: {
      label: 'On Break',
      color: colors.error, // error represents danger
      bgColor: colors.error + '15',
    },
    on_leave: {
      label: 'On Leave',
      color: colors.textSecondary, // textSecondary represents neutral
      bgColor: colors.border + '50',
    },
    not_working: {
      label: 'Not Working Today',
      color: colors.textSecondary,
      bgColor: colors.border + '50',
    },
    fully_booked: {
      label: 'Fully Booked',
      color: colors.text, // primary/text represents dark
      bgColor: colors.border + '80',
    },
  };

  const badgeConfig = STATUS_MAP[status] || {
    label: status.replace('_', ' '),
    color: colors.textSecondary,
    bgColor: colors.border + '50',
  };

  return (
    <View style={[styles.badgeContainer, { backgroundColor: badgeConfig.bgColor, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }]}>
      <Text style={[styles.badgeText, { color: badgeConfig.color, fontSize: typography.sizes.xs }]}>
        {badgeConfig.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
});

export default AvailabilityBadge;
