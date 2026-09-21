import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertTriangle, CalendarOff } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { formatDateKey } from '../utils/doctorFormat';

export type LeaveGroup = {
  /** Leave row ids, one per day, in date order. */
  ids: string[];
  dates: string[];
  reason: string | null;
};

interface LeaveCardProps {
  group: LeaveGroup;
  bookedCount: number;
  past: boolean;
  cancelling: boolean;
  onCancel?: () => void;
}

/**
 * A run of consecutive leave days with the same reason, shown as one entry.
 * Previously a week off rendered as seven identical cards.
 */
export const LeaveCard = ({ group, bookedCount, past, cancelling, onCancel }: LeaveCardProps) => {
  const { colors, spacing, radius } = useTheme();
  const first = group.dates[0];
  const last = group.dates[group.dates.length - 1];
  const days = group.dates.length;

  const title =
    days === 1
      ? formatDateKey(first, { weekday: 'long', month: 'long', day: 'numeric' })
      : `${formatDateKey(first, { month: 'short', day: 'numeric' })} – ${formatDateKey(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <Card variant={past ? 'flat' : 'outlined'} padding="md" style={{ marginBottom: spacing.sm, opacity: past ? 0.75 : 1 }}>
      <View style={styles.row}>
        <View
          style={[
            styles.icon,
            { backgroundColor: past ? colors.tint.neutral : colors.tint.error, borderRadius: radius.md },
          ]}
        >
          <CalendarOff size={18} color={past ? colors.textTertiary : colors.error} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {days > 1 ? `${days} days · ` : ''}
            {group.reason || 'No reason given'}
          </AppText>
        </View>
      </View>

      {!past && bookedCount > 0 && (
        <View
          style={[
            styles.warning,
            { backgroundColor: colors.tint.warning, borderRadius: radius.md, marginTop: spacing.sm, padding: spacing.sm },
          ]}
        >
          <AlertTriangle size={14} color={colors.warning} />
          <AppText variant="caption" tone="warning" weight="600" style={styles.warningText}>
            {bookedCount} active booking{bookedCount === 1 ? '' : 's'} on {days === 1 ? 'this day' : 'these days'} — contact the front desk to reschedule.
          </AppText>
        </View>
      )}

      {!past && onCancel && (
        <AppButton
          title={days === 1 ? 'Cancel leave' : `Cancel all ${days} days`}
          variant="ghost"
          size="sm"
          fullWidth={false}
          loading={cancelling}
          textStyle={{ color: colors.error }}
          containerStyle={{ alignSelf: 'flex-end' }}
          onPress={onCancel}
        />
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    marginLeft: 6,
    flex: 1,
  },
});
