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
import { DashboardCard } from '../components/DashboardCard';
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  Calendar,
  AlertCircle,
  Sparkles,
} from 'lucide-react-native';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export default function DashboardScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const {
    isLoading,
    error,
    doctorProfile,
    availability,
    recentPatients,
    incomeSummary,
    schedule,
    refresh,
  } = useDoctorDashboard();

  const handleRefresh = React.useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (isLoading && !doctorProfile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !doctorProfile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <AlertCircle size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
        <Text style={[styles.errorText, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {error}
        </Text>
      </View>
    );
  }

  // Find today's schedule
  const todayDay = new Date().getDay();
  const todaySchedule = schedule.find(s => s.day_of_week === todayDay);

  const formatTime = (timeStr?: string | null) => {
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} colors={[colors.primary]} />
      }
    >
      {/* Header Greeting */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greetingLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Good Morning
          </Text>
          <Text style={[styles.doctorName, { color: colors.text, fontSize: typography.sizes.lg }]}>
            Dr. {doctorProfile?.name || 'Doctor'}
          </Text>
        </View>
        <View style={[styles.sparkleContainer, { backgroundColor: colors.primary + '10' }]}>
          <Sparkles size={18} color={colors.primary} />
        </View>
      </View>

      {/* Cards Grid */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm, marginHorizontal: spacing.sm }]}>
        Today's Stats
      </Text>
      <View style={styles.gridRow}>
        <DashboardCard
          title="Today's Patients"
          value={incomeSummary?.today_appointments_count ?? 0}
          icon={<Users size={16} color={colors.primary} />}
          subtitle="Total Booked"
        />
        <DashboardCard
          title="Current Queue"
          value={availability?.tokens_ahead ?? 0}
          icon={<Clock size={16} color={colors.primary} />}
          subtitle={`${availability?.estimated_wait_minutes ?? 0}m est. wait`}
        />
      </View>

      <View style={styles.gridRow}>
        <DashboardCard
          title="Completed"
          value={incomeSummary?.completed_count ?? 0}
          icon={<CheckCircle size={16} color={colors.primary} />}
          subtitle="Consultations finished"
        />
        <DashboardCard
          title="Total Income"
          value={`Rs. ${(incomeSummary?.total_fee ?? 0).toLocaleString()}`}
          icon={<TrendingUp size={16} color={colors.primary} />}
          subtitle={`Fee: Rs. ${doctorProfile?.fee || 0}`}
        />
      </View>

      {/* Schedule Info Box */}
      <View style={[styles.scheduleBox, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        <Calendar size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <View style={styles.scheduleInfo}>
          <Text style={[styles.scheduleLabel, { color: colors.textSecondary, fontSize: 10 }]}>
            TODAY'S SCHEDULE ({WEEKDAYS[todayDay]})
          </Text>
          <Text style={[styles.scheduleTime, { color: colors.text, fontSize: typography.sizes.sm }]}>
            {todaySchedule
              ? `${formatTime(todaySchedule.start_time)} - ${formatTime(todaySchedule.end_time)} (${todaySchedule.slot_duration}m slots)`
              : 'OFF / Not Scheduled Today'}
          </Text>
        </View>
      </View>

      {/* Recent Patients */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm, marginHorizontal: spacing.sm, marginTop: spacing.md }]}>
        Recent Patients
      </Text>
      <View style={[styles.recentBox, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        {recentPatients.length === 0 ? (
          <Text style={[styles.noPatientsText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            No recent patients found.
          </Text>
        ) : (
          recentPatients.map((patient, index) => (
            <View
              key={index}
              style={[
                styles.patientRow,
                {
                  borderBottomWidth: index === recentPatients.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border + '20',
                },
              ]}
            >
              <View style={styles.patientLeft}>
                <Text style={[styles.patientNameText, { color: colors.text, fontSize: typography.sizes.sm }]}>
                  {patient.patient_name}
                </Text>
                <Text style={[styles.patientDateText, { color: colors.textSecondary, fontSize: 10 }]}>
                  Last Visit: {new Date(patient.last_appointment_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <View
                style={[
                  styles.patientStatusBadge,
                  {
                    backgroundColor:
                      patient.status.toLowerCase() === 'completed'
                        ? colors.success + '15'
                        : colors.primary + '15',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.patientStatusText,
                    {
                      color:
                        patient.status.toLowerCase() === 'completed'
                          ? colors.success
                          : colors.primary,
                      fontSize: 10,
                    },
                  ]}
                >
                  {patient.status.toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greetingLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  doctorName: {
    fontWeight: '800',
  },
  sparkleContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  scheduleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  scheduleTime: {
    fontWeight: '700',
  },
  recentBox: {
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  noPatientsText: {
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '500',
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  patientLeft: {
    flex: 1,
  },
  patientNameText: {
    fontWeight: '700',
    marginBottom: 2,
  },
  patientDateText: {
    fontWeight: '500',
  },
  patientStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  patientStatusText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
