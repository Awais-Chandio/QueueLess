import React from 'react';
import { View, Switch, Pressable, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { WEEKDAYS, formatTime12h, timeToMinutes } from '../utils/doctorFormat';

interface DayScheduleCardProps {
  dayOfWeek: number;
  startTime?: string | null;
  endTime?: string | null;
  slotDuration?: number | null;
  isAvailable: boolean;
  isToday: boolean;
  isLast: boolean;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}

/** One weekday row inside the weekly hours card. Tapping the row edits hours. */
export const DayScheduleCard = ({
  dayOfWeek,
  startTime,
  endTime,
  slotDuration,
  isAvailable,
  isToday,
  isLast,
  onToggle,
  onEdit,
}: DayScheduleCardProps) => {
  const { colors, spacing, radius } = useTheme();

  const slots =
    isAvailable && startTime && endTime && slotDuration
      ? Math.max(0, Math.floor((timeToMinutes(endTime) - timeToMinutes(startTime)) / slotDuration))
      : 0;

  return (
    <Pressable
      onPress={onEdit}
      disabled={!isAvailable}
      accessibilityRole="button"
      accessibilityLabel={`${WEEKDAYS[dayOfWeek]}, ${isAvailable ? `${formatTime12h(startTime)} to ${formatTime12h(endTime)}` : 'off'}`}
      accessibilityHint={isAvailable ? 'Edit working hours' : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          paddingVertical: spacing.md,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.divider,
          backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <View style={styles.dayCol}>
        <View style={styles.dayLine}>
          <AppText variant="bodyStrong" tone={isAvailable ? 'primary' : 'tertiary'}>
            {WEEKDAYS[dayOfWeek]}
          </AppText>
          {isToday && (
            <View style={[styles.todayPill, { backgroundColor: colors.tint.primary, borderRadius: radius.pill }]}>
              <AppText variant="caption" tone="brand" weight="600">
                Today
              </AppText>
            </View>
          )}
        </View>
        <AppText variant="caption" tone={isAvailable ? 'secondary' : 'tertiary'}>
          {isAvailable
            ? `${formatTime12h(startTime)} – ${formatTime12h(endTime)} · ${slotDuration} min slots · ${slots} slots`
            : 'Off — not bookable'}
        </AppText>
      </View>
      {isAvailable && <ChevronRight size={18} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />}
      <Switch
        value={isAvailable}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
        accessibilityLabel={`${WEEKDAYS[dayOfWeek]} availability`}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayCol: {
    flex: 1,
  },
  dayLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayPill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
});
