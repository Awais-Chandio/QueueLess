import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, CalendarDays } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { DoctorSheet } from './DoctorSheet';
import { dateKeysBetween } from '../utils/doctorFormat';

type Props = {
  visible: boolean;
  existingLeaveDates: Set<string>;
  bookingCounts: Record<string, number>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (start: Date, end: Date, reason: string) => void;
};

const MAX_DAYS = 60;
const REASON_MAX = 200;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Replaces two "YYYY-MM-DD" text fields. Dates come from native pickers that
 * cannot go into the past, and the sheet shows before saving how many days are
 * new, which are already on leave, and whether patients are booked.
 */
export const RequestLeaveSheet = ({
  visible,
  existingLeaveDates,
  bookingCounts,
  submitting,
  onClose,
  onSubmit,
}: Props) => {
  const { colors, spacing, radius } = useTheme();
  const [start, setStart] = useState(startOfToday);
  const [end, setEnd] = useState(startOfToday);
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (visible) {
      setStart(startOfToday());
      setEnd(startOfToday());
      setReason('');
      setPicker(null);
    }
  }, [visible]);

  const summary = useMemo(() => {
    const keys = end >= start ? dateKeysBetween(start, end) : [];
    const newKeys = keys.filter(key => !existingLeaveDates.has(key));
    const booked = newKeys.reduce((sum, key) => sum + (bookingCounts[key] ?? 0), 0);
    return { total: keys.length, newDays: newKeys.length, alreadyOff: keys.length - newKeys.length, booked };
  }, [bookingCounts, end, existingLeaveDates, start]);

  const error =
    end < start
      ? 'The last day must be on or after the first day.'
      : summary.total > MAX_DAYS
        ? `Request at most ${MAX_DAYS} days at a time.`
        : summary.newDays === 0
          ? 'You are already on leave for these dates.'
          : null;

  const dateField = (which: 'start' | 'end', label: string, date: Date) => (
    <Pressable
      onPress={() => setPicker(which)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${date.toDateString()}`}
      style={[
        styles.dateField,
        {
          borderColor: picker === which ? colors.primary : colors.border,
          borderRadius: radius.control,
          padding: spacing.md,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <View style={styles.dateValue}>
        <CalendarDays size={16} color={colors.primary} />
        <AppText variant="bodyStrong" style={{ marginLeft: 6 }}>
          {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </AppText>
      </View>
    </Pressable>
  );

  return (
    <DoctorSheet visible={visible} onClose={onClose} title="Request time off" maxHeightPercent={0.85}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {dateField('start', 'First day', start)}
        {dateField('end', 'Last day', end)}
      </View>

      {picker && (
        <DateTimePicker
          value={picker === 'start' ? start : end}
          mode="date"
          minimumDate={picker === 'start' ? startOfToday() : start}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setPicker(null);
            if (event.type !== 'set' || !date) return;
            const picked = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            if (picker === 'start') {
              setStart(picked);
              if (end < picked) setEnd(picked);
            } else {
              setEnd(picked);
            }
          }}
        />
      )}

      <View style={{ marginTop: spacing.lg }}>
        <AppInput
          label="Reason (optional)"
          placeholder="e.g. Conference, family commitment"
          value={reason}
          onChangeText={setReason}
          maxLength={REASON_MAX}
          helperText="Visible to your clinic's admin and front desk."
        />
      </View>

      <View
        style={[
          styles.summary,
          {
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: error ? colors.tint.error : colors.tint.primary,
          },
        ]}
      >
        <AppText variant="label" weight="600" tone={error ? 'error' : 'brand'}>
          {error ??
            `${summary.newDays} day${summary.newDays === 1 ? '' : 's'} off${summary.alreadyOff > 0 ? ` · ${summary.alreadyOff} already on leave` : ''}`}
        </AppText>
        {!error && summary.booked > 0 && (
          <View style={[styles.warning, { marginTop: spacing.xs }]}>
            <AlertTriangle size={14} color={colors.warning} />
            <AppText variant="caption" tone="warning" weight="600" style={styles.warningText}>
              {summary.booked} patient booking{summary.booked === 1 ? ' is' : 's are'} already on these dates and will not be cancelled automatically.
            </AppText>
          </View>
        )}
      </View>

      <AppButton
        title={summary.newDays > 1 ? `Add ${summary.newDays} days off` : 'Add day off'}
        loading={submitting}
        disabled={!!error || submitting}
        containerStyle={{ marginTop: spacing.lg }}
        onPress={() => onSubmit(start, end, reason)}
      />
    </DoctorSheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  dateField: {
    flex: 1,
    borderWidth: 1,
  },
  dateValue: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  summary: {},
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    marginLeft: 6,
    flex: 1,
  },
});
