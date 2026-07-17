import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { Clock, Edit2 } from 'lucide-react-native';

interface DayScheduleCardProps {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isAvailable: boolean;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DayScheduleCard = ({
  dayOfWeek,
  startTime,
  endTime,
  slotDuration,
  isAvailable,
  onToggle,
  onEdit,
}: DayScheduleCardProps) => {
  const { colors, typography, radius } = useTheme();

  const formatTimeStr = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const displayMin = `${minutes}`.padStart(2, '0');
    return `${displayHour.toString().padStart(2, '0')}:${displayMin} ${period}`;
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
      <View style={styles.header}>
        <Text style={[styles.day, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {WEEKDAYS[dayOfWeek]}
        </Text>
        <Switch
          value={isAvailable}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>

      {isAvailable ? (
        <View style={styles.body}>
          <View style={styles.details}>
            <Clock size={14} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.time, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              {formatTimeStr(startTime)} - {formatTimeStr(endTime)} ({slotDuration} min slots)
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: colors.primary + '10', borderRadius: radius.md }]}
            onPress={onEdit}
          >
            <Edit2 size={12} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.editText, { color: colors.primary, fontSize: 10 }]}>
              Edit Hours
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.offBody}>
          <Text style={[styles.offText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Off Day (Not available for booking)
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  day: {
    fontWeight: '800',
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  time: {
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editText: {
    fontWeight: '700',
  },
  offBody: {
    paddingVertical: 4,
  },
  offText: {
    fontWeight: '500',
    fontStyle: 'italic',
  },
});
