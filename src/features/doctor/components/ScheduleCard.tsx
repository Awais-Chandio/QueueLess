import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { Calendar, AlertCircle } from 'lucide-react-native';

interface ScheduleCardProps {
  dayOfWeek: number;
  startTime?: string | null;
  endTime?: string | null;
  isOff: boolean;
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

export const ScheduleCard = ({ dayOfWeek, startTime, endTime, isOff }: ScheduleCardProps) => {
  const { colors, typography, radius } = useTheme();

  const formatTimeStr = (timeStr?: string | null) => {
    if (!timeStr) return '';
    // Format HH:MM:SS or HH:MM to 12 hour AM/PM
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const displayMin = `${minutes}`.padStart(2, '0');
    return `${displayHour.toString().padStart(2, '0')}:${displayMin} ${period}`;
  };

  const formattedHours = isOff
    ? 'OFF'
    : `${formatTimeStr(startTime)} - ${formatTimeStr(endTime)}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: isOff ? colors.error + '10' : colors.primary + '10' }]}>
          {isOff ? (
            <AlertCircle size={18} color={colors.error} />
          ) : (
            <Calendar size={18} color={colors.primary} />
          )}
        </View>
        <Text style={[styles.day, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {WEEKDAYS[dayOfWeek] || `Day ${dayOfWeek}`}
        </Text>
      </View>

      <View style={[styles.badge, { backgroundColor: isOff ? colors.error + '15' : colors.success + '15', borderRadius: radius.md }]}>
        <Text style={[styles.hours, { color: isOff ? colors.error : colors.success, fontSize: typography.sizes.xs }]}>
          {formattedHours}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  day: {
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hours: {
    fontWeight: '800',
  },
});
