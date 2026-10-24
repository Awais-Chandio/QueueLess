import React, { useEffect, useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Activity, UserRound, UserX, Volume2 } from 'lucide-react-native';
import { ArrowRight, ChevronsRight } from '../../../components/ui/DirectionalIcons';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import type { QueueToken } from '../../queue/api/queueRpc';
import { minutesWithDoctor } from '../../queue/utils/queueState';

type Props = {
  current: QueueToken | null;
  next: QueueToken | null;
  onBreak: boolean;
  busy: boolean;
  onCallNext: () => void;
  /** Opens the notes sheet in "complete" mode. */
  onComplete: (token: QueueToken) => void;
  onRecall: (token: QueueToken) => void;
  onSkip: (token: QueueToken) => void;
  onNoShow: (token: QueueToken) => void;
};

const useElapsedMinutes = (token: QueueToken | null) => {
  const [minutes, setMinutes] = useState(() => minutesWithDoctor(token));
  const since = token?.started_at ?? token?.called_at;

  useEffect(() => {
    setMinutes(minutesWithDoctor(token));
    if (!since) return;
    const id = setInterval(() => setMinutes(minutesWithDoctor(token)), 30_000);
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
export const NowServingCard = ({ current, next, onBreak, busy, onCallNext, onComplete, onRecall, onSkip, onNoShow }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const elapsed = useElapsedMinutes(current);

  const confirmNoShow = (token: QueueToken) =>
    Alert.alert('Mark as No Show?', `${token.patient_name || 'This patient'} (token ${token.token_number}) didn't come in.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Mark No Show', style: 'destructive', onPress: () => onNoShow(token) },
    ]);

  return (
    <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
      <View style={styles.labelRow}>
        <View style={[styles.liveDot, { backgroundColor: current ? colors.success : colors.textTertiary }]} />
        <AppText variant="label" tone="secondary" weight="600">
          {current ? 'NOW SERVING' : 'READY FOR NEXT PATIENT'}
        </AppText>
      </View>

      {current ? (
        <Animated.View key={current.id} entering={FadeIn.duration(280)}>
          <View style={[styles.servingRow, { marginTop: spacing.md }]}>
            <Animated.View
              entering={ZoomIn.springify().damping(14)}
              style={[styles.tokenBlock, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
            >
              <AppText variant="caption" tone="onPrimary" weight="600">
                TOKEN
              </AppText>
              <AppText variant="display" tone="onPrimary" weight="800">
                {current.token_number}
              </AppText>
            </Animated.View>
            <View style={styles.servingInfo}>
              <AppText variant="section" numberOfLines={2}>
                {current.patient_name || 'Patient'}
              </AppText>
              <AppText variant="label" tone="secondary" numberOfLines={1}>
                {current.is_guest ? 'Walk-in / QR patient' : 'App patient'}
              </AppText>
              {elapsed !== null && (
                <View style={[styles.elapsed, { backgroundColor: colors.tint.success, borderRadius: radius.pill }]}>
                  <Activity size={12} color={colors.success} />
                  <AppText variant="caption" tone="success" weight="600" style={{ marginStart: 4 }}>
                    {elapsed < 1 ? 'Just called in' : `In consultation · ${elapsed} min`}
                  </AppText>
                </View>
              )}
            </View>
          </View>

          <AppButton
            title="Complete & add notes"
            variant="success"
            disabled={busy}
            containerStyle={{ marginTop: spacing.lg }}
            onPress={() => onComplete(current)}
          />
          <View style={[styles.actions, { marginTop: spacing.sm, gap: spacing.sm }]}>
            <View style={styles.flex}>
              <AppButton
                title={current.status === 'called' ? 'Call again' : 'Skip'}
                size="sm"
                variant="outline"
                disabled={busy}
                leftIcon={current.status === 'called' ? <Volume2 size={14} color={colors.primary} /> : <ChevronsRight size={14} color={colors.primary} />}
                onPress={() => (current.status === 'called' ? onRecall(current) : onSkip(current))}
              />
            </View>
            {current.status === 'called' && (
              <View style={styles.flex}>
                <AppButton
                  title="Skip"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  leftIcon={<ChevronsRight size={14} color={colors.primary} />}
                  onPress={() => onSkip(current)}
                />
              </View>
            )}
            <View style={styles.flex}>
              <AppButton
                title="No Show"
                size="sm"
                variant="ghost"
                disabled={busy}
                leftIcon={<UserX size={14} color={colors.error} />}
                textStyle={{ color: colors.error }}
                onPress={() => confirmNoShow(current)}
              />
            </View>
          </View>
        </Animated.View>
      ) : (
        <AppText variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
          {onBreak
            ? "You're on a break. End it from the status button to call the next patient."
            : next
              ? 'No one is in consultation. Call in the next patient when you are ready.'
              : 'Nobody is waiting right now.'}
        </AppText>
      )}

      {next && (
        <View style={[styles.nextSection, { marginTop: spacing.lg, paddingTop: spacing.md, borderTopColor: colors.divider }]}>
          <View style={styles.nextRow}>
            <View style={[styles.nextIcon, { backgroundColor: colors.tint.primary, borderRadius: radius.pill }]}>
              <UserRound size={16} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="caption" tone="secondary">
                {`Up next · Token ${next.token_number}`}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {next.patient_name || 'Patient'}
              </AppText>
            </View>
          </View>
          <AppButton
            title={current ? 'Complete without notes & call next' : `Call in token ${next.token_number}`}
            variant={current ? 'outline' : 'primary'}
            rightIcon={current ? undefined : <ArrowRight size={18} color={colors.onPrimary} />}
            loading={busy}
            disabled={busy || onBreak}
            containerStyle={{ marginTop: spacing.md }}
            onPress={onCallNext}
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
    marginEnd: 8,
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
    marginEnd: 16,
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
