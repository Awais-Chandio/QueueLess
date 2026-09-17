import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { DoctorSheet } from './DoctorSheet';
import {
  WEEKDAYS,
  dateToTimeString,
  formatTime12h,
  timeStringToDate,
  timeToMinutes,
} from '../utils/doctorFormat';

export type DayHoursValue = { start_time: string; end_time: string; slot_duration: number };

type Props = {
  dayOfWeek: number | null;
  initial: DayHoursValue;
  saving: boolean;
  onClose: () => void;
  onSave: (value: DayHoursValue) => void;
};

const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60];

/**
 * Edits one weekday's hours with native time pickers. The previous editor was
 * three free-text fields ("24h format - HH:MM") with no check that the shift
 * ends after it starts or fits at least one slot.
 */
export const DayHoursSheet = ({ dayOfWeek, initial, saving, onClose, onSave }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const [value, setValue] = useState<DayHoursValue>(initial);
  const [picker, setPicker] = useState<'start_time' | 'end_time' | null>(null);

  useEffect(() => {
    if (dayOfWeek !== null) {
      setValue(initial);
      setPicker(null);
    }
    // Reset only when a different day is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOfWeek]);

  const minutes = timeToMinutes(value.end_time) - timeToMinutes(value.start_time);
  const slots = minutes > 0 ? Math.floor(minutes / value.slot_duration) : 0;
  const error =
    minutes <= 0
      ? 'End time must be after start time.'
      : slots < 1
        ? `The shift is shorter than one ${value.slot_duration}-minute slot.`
        : null;

  const timeField = (field: 'start_time' | 'end_time', label: string) => (
    <Pressable
      onPress={() => setPicker(field)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatTime12h(value[field])}`}
      style={[
        styles.timeField,
        {
          borderColor: picker === field ? colors.primary : colors.border,
          borderRadius: radius.control,
          backgroundColor: colors.surface,
          padding: spacing.md,
        },
      ]}
    >
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <View style={styles.timeValue}>
        <Clock size={16} color={colors.primary} />
        <AppText variant="subtitle" style={{ marginLeft: 6 }}>
          {formatTime12h(value[field])}
        </AppText>
      </View>
    </Pressable>
  );

  return (
    <DoctorSheet
      visible={dayOfWeek !== null}
      onClose={onClose}
      title={dayOfWeek !== null ? `${WEEKDAYS[dayOfWeek]} hours` : ''}
      maxHeightPercent={0.7}
    >
      <View style={[styles.row, { gap: spacing.sm }]}>
        {timeField('start_time', 'Starts')}
        {timeField('end_time', 'Ends')}
      </View>

      {picker && (
        <DateTimePicker
          value={timeStringToDate(value[picker])}
          mode="time"
          minuteInterval={5}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setPicker(null);
            if (event.type === 'set' && date) {
              setValue(current => ({ ...current, [picker]: dateToTimeString(date) }));
            }
          }}
        />
      )}

      <AppText variant="label" weight="600" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Appointment length
      </AppText>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {SLOT_OPTIONS.map(option => {
          const selected = value.slot_duration === option;
          return (
            <Pressable
              key={option}
              onPress={() => setValue(current => ({ ...current, slot_duration: option }))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.pill,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <AppText variant="label" weight="600" tone={selected ? 'onPrimary' : 'secondary'}>
                {option} min
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.summary,
          {
            marginTop: spacing.lg,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: error ? colors.tint.error : colors.tint.primary,
          },
        ]}
      >
        <AppText variant="label" tone={error ? 'error' : 'brand'} weight="600">
          {error ?? `${slots} bookable slots on this day`}
        </AppText>
      </View>

      <AppButton
        title="Save hours"
        loading={saving}
        disabled={!!error || saving}
        containerStyle={{ marginTop: spacing.lg }}
        onPress={() => onSave(value)}
      />
    </DoctorSheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  timeField: {
    flex: 1,
    borderWidth: 1,
  },
  timeValue: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  summary: {},
});
