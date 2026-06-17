import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentsService } from '../api/appointmentsService'; // adjusted path
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue'; // adjusted path
import type { AppStackParamList } from '../../../navigation/types'; // adjusted path
import type { AppointmentFull } from '../../../types/appointment'; // adjusted path
import { MapPin, Calendar, CircleDot } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';

type QueueStatusRouteProp = RouteProp<AppStackParamList, 'QueueStatus'>;

const QueueStatusScreen = () => {
  const route = useRoute<QueueStatusRouteProp>();
  const { appointmentId } = route.params;
  const { colors, spacing, typography } = useTheme();

  const [appointment, setAppointment] = useState<AppointmentFull | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAppointment = useCallback(async () => {
    try {
      const data = await appointmentsService.fetchAppointmentById(appointmentId);
      setAppointment(data);
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const { queueData } = useRealtimeQueue(appointmentId);

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={150} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!appointment) {
    return (
      <ScreenWrapper>
        <EmptyState title="Appointment Not Found" subtitle="Unable to load queue status." />
      </ScreenWrapper>
    );
  }

  const waitMins = queueData?.estimated_wait_mins ?? appointment.estimated_wait_mins;
  const peopleAhead = queueData?.people_ahead ?? 0;
  const status = queueData?.status ?? appointment.status;
  
  // Progress calculation (arbitrary max wait of 60 for progress visual if not known)
  const initialWait = appointment.estimated_wait_mins || 60;
  const progress = waitMins ? Math.max(0, 1 - (waitMins / initialWait)) : 0;

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <View style={{ marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            Queue Status
          </Text>
          <Badge label={status.toUpperCase()} variant={status === 'completed' ? 'success' : status === 'cancelled' ? 'error' : 'warning'} />
        </View>

        {/* Progress Card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.md }}>
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Estimated Wait</Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {waitMins != null ? `${waitMins} mins` : '--'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>People Ahead</Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {peopleAhead != null ? peopleAhead : '--'}
              </Text>
            </View>
          </View>
          <ProgressBar progress={progress} color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm, textAlign: 'center' }}>
            {peopleAhead === 0 ? "You're next!" : "Your turn is approaching"}
          </Text>
        </Card>

        {/* Details Card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.md }}>
            Appointment Details
          </Text>
          <View style={{ gap: spacing.md }}>
            <View style={styles.detailRow}>
              <CircleDot color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Token</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>#{appointment.token_number || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Calendar color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Date & Time</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                  {new Date(appointment.scheduled_at).toLocaleString()}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <MapPin color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Center</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>{appointment.center_name}</Text>
              </View>
            </View>
          </View>
        </Card>

      </View>
    </ScreenWrapper>
  );
};

export default QueueStatusScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  detailText: {
    flex: 1,
  }
});
