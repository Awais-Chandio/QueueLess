import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Activity, ArrowRight, UserRound } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import type { AppointmentFull } from '../../../types/appointment';
import type { QueueAction } from '../hooks/useDoctorQueue';

type Props = {
  currentPatient: AppointmentFull | null;
  nextPatient: AppointmentFull | null;
  busyAction: (appointmentId: string) => QueueAction | null;
  disabled: boolean;
  onAction: (action: QueueAction, appointment: AppointmentFull) => void;
};

const useElapsedMinutes = (since?: string | null) => {
  const compute = () =>
    since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)) : null;
  const [minutes, setMinutes] = useState(compute);

  useEffect(() => {
    setMinutes(compute());
    if (!since) return;
    const id = setInterval(() => setMinutes(compute()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);

  return minutes;
};

/**
 * The top of the doctor's queue: who is in the room now, and who is next.
 *
 * The token block is keyed by appointment id, so calling the next patient
 * replaces it with a zoom-in rather than silently swapping the number — the
 * change is the most important thing on the screen and should be seen.
 * Reanimated's layout animations follow the OS reduce-motion setting.
 */
export const NowServingCard = ({ currentPatient, nextPatient, busyAction, disabled, onAction }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const elapsed = useElapsedMinutes(currentPatient?.called_at ?? currentPatient?.started_at);

  return (
    <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
      <View style={styles.labelRow}>
        <View style={[styles.liveDot, { backgroundColor: currentPatient ? colors.success : colors.textTertiary }]} />
        <AppText variant="label" tone="secondary" weight="600">
          {currentPatient ? 'NOW SERVING' : 'READY FOR NEXT PATIENT'}
        </AppText>
      </View>

      {currentPatient ? (
        <Animated.View key={currentPatient.id} entering={FadeIn.duration(280)}>
          <View style={[styles.servingRow, { marginTop: spacing.md }]}>
            <Animated.View
              entering={ZoomIn.springify().damping(14)}
              style={[styles.tokenBlock, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
            >
              <AppText variant="caption" tone="onPrimary" weight="600">
                TOKEN
              </AppText>
              <AppText variant="display" tone="onPrimary" weight="800">
                {currentPatient.token_number ?? '—'}
              </AppText>
            </Animated.View>
            <View style={styles.servingInfo}>
              <AppText variant="section" numberOfLines={2}>
                {currentPatient.patient_name || 'Patient'}
              </AppText>
              <AppText variant="label" tone="secondary" numberOfLines={1}>
                {currentPatient.service_name || 'Consultation'}
              </AppText>
              {elapsed !== null && (
                <View style={[styles.elapsed, { backgroundColor: colors.tint.success, borderRadius: radius.pill }]}>
                  <Activity size={12} color={colors.success} />
                  <AppText variant="caption" tone="success" weight="600" style={{ marginLeft: 4 }}>
                    {elapsed < 1 ? 'Just called in' : `In consultation · ${elapsed} min`}
                  </AppText>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.actions, { marginTop: spacing.lg, gap: spacing.sm }]}>
            <AppButton
              title="Complete"
              variant="success"
              loading={busyAction(currentPatient.id) === 'complete_service'}
              disabled={disabled}
              containerStyle={styles.flex}
              onPress={() => onAction('complete_service', currentPatient)}
            />
            <AppButton
              title="No Show"
              variant="outline"
              loading={busyAction(currentPatient.id) === 'no_show'}
              disabled={disabled}
              containerStyle={styles.flex}
              textStyle={{ color: colors.error }}
              onPress={() => onAction('no_show', currentPatient)}
            />
          </View>
        </Animated.View>
      ) : (
        <AppText variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
          {nextPatient
            ? 'No one is in consultation. Call in the next patient when you are ready.'
            : 'No confirmed patients are waiting right now.'}
        </AppText>
      )}

      {nextPatient && (
        <View
          style={[
            styles.nextSection,
            { marginTop: spacing.lg, paddingTop: spacing.md, borderTopColor: colors.divider },
          ]}
        >
          <View style={styles.nextRow}>
            <View style={[styles.nextIcon, { backgroundColor: colors.tint.primary, borderRadius: radius.pill }]}>
              <UserRound size={16} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="caption" tone="secondary">
                Up next · Token {nextPatient.token_number ?? '—'}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {nextPatient.patient_name || 'Patient'}
              </AppText>
            </View>
          </View>
          <AppButton
            title={currentPatient ? 'Complete current patient first' : `Call In Token ${nextPatient.token_number ?? ''}`.trim()}
            variant={currentPatient ? 'outline' : 'primary'}
            rightIcon={currentPatient ? undefined : <ArrowRight size={18} color={colors.onPrimary} />}
            loading={busyAction(nextPatient.id) === 'start_service'}
            disabled={disabled || currentPatient !== null}
            containerStyle={{ marginTop: spacing.md }}
            onPress={() => onAction('start_service', nextPatient)}
          />
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenBlock: {
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginRight: 16,
  },
  servingInfo: {
    flex: 1,
  },
  elapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
  },
  nextSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
