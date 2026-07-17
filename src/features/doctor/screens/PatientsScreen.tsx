import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { PatientCard } from '../components/PatientCard';
import { Users, AlertCircle } from 'lucide-react-native';

export default function PatientsScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { isLoading, error, todayAppointments, refresh } = useDoctorDashboard();

  const handleRefresh = React.useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (isLoading && todayAppointments.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && todayAppointments.length === 0) {
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={todayAppointments}
        keyExtractor={item => item.appointment_id}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
              Today's Patients
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              List of patient appointments, tokens, and check-in statuses for today.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
            <Users size={32} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              No appointments booked for today yet.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PatientCard
            patientName={item.patient_name}
            tokenNumber={item.token_number}
            appointmentTime={item.appointment_time}
            status={item.status}
          />
        )}
      />
    </View>
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderWidth: 1,
    marginTop: 10,
  },
  emptyText: {
    fontWeight: '500',
    textAlign: 'center',
  },
});
