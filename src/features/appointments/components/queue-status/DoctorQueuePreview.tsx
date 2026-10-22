import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { CircleDot, Hourglass, Stethoscope } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AnimatedCard from '../../../../components/ui/AnimatedCard';
import AppButton from '../../../../components/ui/AppButton';
import AppText from '../../../../components/ui/AppText';
import { Card } from '../../../../components/ui/Card';
import { CircularProgress } from '../../../../components/ui/CircularProgress';
import { EmptyState } from '../../../../components/ui/EmptyState';
import Loader from '../../../../components/ui/Loader';
import ScreenWrapper from '../../../../components/ui/ScreenWrapper';
import type { StatusChipVariant } from '../../../../components/ui/StatusChip';
import { PATIENT_MARKETPLACE_ENABLED } from '../../../../config/featureFlags';
import { supabase } from '../../../../lib/supabase';
import type { DoctorAvailabilityStatus } from '../../../../types/doctor';
import { logger } from '../../../../utils/logger';
import { scaleFont, wp } from '../../../../utils/responsive';
import { getPakistanTodayDateString } from '../../utils/appointmentTime';
import { MetricRow } from './MetricRow';
import { QueueStatusHeader } from './QueueStatusHeader';
import { TokenBoxes } from './TokenBoxes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OFFLINE = { label: 'Offline', chip: 'default' as StatusChipVariant };
const STATUS: Partial<Record<DoctorAvailabilityStatus, { label: string; chip: StatusChipVariant }>> = {
  available: { label: 'Available', chip: 'confirmed' },
  busy: { label: 'Busy', chip: 'warning' },
  on_break: { label: 'On Break', chip: 'doctor_on_break' },
  on_leave: { label: 'On Leave', chip: 'cancelled' },
  not_working: { label: 'Not Working', chip: 'pending' },
  fully_booked: { label: 'Fully Booked', chip: 'error' },
};

type Props = { doctorId: string; centerId?: string; serviceId?: string };

/** A doctor's live queue before booking (marketplace "book a token" flow). */
export const DoctorQueuePreview = ({ doctorId, centerId, serviceId }: Props) => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { colors, spacing, radius } = useTheme();
  const [doctor, setDoctor] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!UUID.test(doctorId)) {
      logger.warn('DoctorQueuePreview: doctorId is not a UUID:', doctorId);
      setLoading(false);
      return;
    }
    try {
      const [doc, snapshot, avail] = await Promise.all([
        supabase.from('doctors').select('*').eq('id', doctorId).single(),
        supabase.rpc('get_doctor_queue_snapshot', { p_doctor_id: doctorId, p_queue_date: getPakistanTodayDateString() }),
        supabase.rpc('get_doctor_availability', { p_doctor_id: doctorId }),
      ]);
      if (doc.error) throw doc.error;
      if (snapshot.error) throw snapshot.error;
      if (avail.error) throw avail.error;
      setDoctor(doc.data);
      setQueue(snapshot.data);
      setAvailability(avail.data?.[0] ?? null);
    } catch (error) {
      logger.error('Failed to fetch doctor queue preview:', error);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    if (!isFocused) return;
    load();
    const channel = supabase
      .channel(`doctor-queue-preview-${doctorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors', filter: `id=eq.${doctorId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId, isFocused, load]);

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader message="Loading live doctor queue..." />
      </ScreenWrapper>
    );
  }

  if (!doctor || !queue) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Queue Preview Unavailable"
          subtitle="Unable to load this doctor's live queue details."
          buttonTitle="Go Back"
          onButtonPress={() => navigation.goBack()}
        />
      </ScreenWrapper>
    );
  }

  const onBreak = Boolean(queue.is_on_break);
  const status = (availability?.status || 'available') as DoctorAvailabilityStatus;
  const meta = STATUS[status] ?? OFFLINE;
  const waitMins = availability?.estimated_wait_minutes || 0;
  const canBook = status !== 'fully_booked' && status !== 'on_leave' && status !== 'not_working';
  const helper = onBreak
    ? `Dr. ${doctor.name} is currently on break. You can still book, but consultations will resume after the break.`
    : status === 'on_leave'
      ? `Dr. ${doctor.name} is on leave today.`
      : status === 'not_working'
        ? `Dr. ${doctor.name} is not working today.`
        : status === 'fully_booked'
          ? `Dr. ${doctor.name} is fully booked for today.`
          : status === 'busy'
            ? 'High volume of tokens. Expect longer wait times.'
            : `You can book token #${queue.next_token} now. Expected wait is about ${waitMins} minutes.`;

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <QueueStatusHeader
          title="Live Queue"
          status={onBreak ? 'doctor_on_break' : meta.chip}
          statusLabel={meta.label}
          onBack={() => navigation.goBack()}
        />

        <AnimatedCard delay={60}>
          <Card padding="md" style={{ marginBottom: spacing.md }}>
            <View style={[styles.row, { gap: spacing.md }]}>
              {doctor.photo_url ? (
                <Image source={{ uri: doctor.photo_url }} style={[styles.photo, { borderRadius: radius.md }]} />
              ) : (
                <View style={[styles.photo, styles.center, { backgroundColor: colors.tint.primary, borderRadius: radius.md }]}>
                  <Stethoscope size={20} color={colors.primary} />
                </View>
              )}
              <View style={styles.flex}>
                <AppText variant="subtitle" weight="800">
                  {doctor.name}
                </AppText>
                <AppText variant="caption" tone="brand" weight="700">
                  {doctor.specialty}
                </AppText>
                {!!doctor.qualification && (
                  <AppText variant="caption" tone="secondary">
                    {doctor.qualification}
                  </AppText>
                )}
              </View>
            </View>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={120}>
          <Card padding="md" style={{ marginBottom: spacing.lg }}>
            {onBreak && (
              <View style={{ backgroundColor: colors.status.warning.bg, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }}>
                <AppText variant="caption" weight="700" style={{ color: colors.status.warning.fg }}>
                  {`Dr. ${doctor.name} is on a break`}
                </AppText>
              </View>
            )}
            <View style={[styles.center, { marginVertical: spacing.md }]}>
              <CircularProgress
                progress={0}
                size={scaleFont(110)}
                strokeWidth={scaleFont(8)}
                trackColor={colors.surfaceSunken}
                centerLabel={queue.current_token ? `#${queue.current_token}` : '--'}
                centerCaption="Serving"
              />
            </View>
            <AppText variant="caption" tone="secondary" align="center" style={{ marginHorizontal: spacing.md }}>
              {helper}
            </AppText>
            <View style={{ marginTop: spacing.lg }}>
              <TokenBoxes
                left={{ label: 'Currently serving', value: queue.current_token != null ? `#${queue.current_token}` : '--' }}
                right={{ label: 'Next token', value: queue.next_token != null ? `#${queue.next_token}` : '--' }}
              />
            </View>
            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
              <MetricRow
                icon={CircleDot}
                label="Consultation Avg"
                value={queue.average_consultation_time ? `${Math.round(queue.average_consultation_time)} min` : '10 min'}
                divider
              />
              <MetricRow icon={Hourglass} label="Est. Wait Time" value={`${waitMins} mins`} />
            </View>
            {PATIENT_MARKETPLACE_ENABLED && (
              <AppButton
                title={canBook ? 'Book Token' : 'Booking Unavailable'}
                disabled={!canBook}
                onPress={() =>
                  // Without a known clinic + service the doctor profile resolves them (or asks) before SelectSlot.
                  centerId && serviceId
                    ? navigation.navigate('SelectSlot', { doctorId, centerId, serviceId })
                    : navigation.navigate('PublicDoctorProfile', { doctorId, centerId, serviceId })
                }
                style={{ marginTop: spacing.lg }}
              />
            )}
          </Card>
        </AnimatedCard>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: wp(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  photo: {
    width: 50,
    height: 50,
  },
});
