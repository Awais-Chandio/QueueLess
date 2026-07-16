import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { ScheduleCard } from '../components/ScheduleCard';
import { AlertCircle } from 'lucide-react-native';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday = 1, Tuesday = 2, ..., Sunday = 0

export default function ScheduleScreen() {
  const { colors, spacing, typography } = useTheme();
  const { isLoading, error, schedule, refresh } = useDoctorDashboard();

  const handleRefresh = React.useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (isLoading && schedule.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && schedule.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <AlertCircle size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
        <Text style={[styles.errorText, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} colors={[colors.primary]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
          My Work Schedule
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
          Weekly hours & consultation slot durations (Read-Only)
        </Text>
      </View>

      {/* Weekday List */}
      <View style={styles.list}>
        {WEEKDAY_ORDER.map(day => {
          const daySchedule = schedule.find(s => s.day_of_week === day);
          const isOff = !daySchedule;

          return (
            <ScheduleCard
              key={day}
              dayOfWeek={day}
              startTime={daySchedule?.start_time}
              endTime={daySchedule?.end_time}
              isOff={isOff}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    textAlign: 'center',
    fontWeight: '500',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '500',
  },
  list: {
    marginTop: 8,
  },
});
