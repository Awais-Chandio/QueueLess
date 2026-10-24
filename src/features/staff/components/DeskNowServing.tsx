import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BellRing, UserX, Volume2 } from 'lucide-react-native';
import { ChevronsRight } from '../../../components/ui/DirectionalIcons';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import type { QueueToken } from '../../queue/api/queueRpc';
import { minutesWithDoctor } from '../../queue/utils/queueState';

type Props = {
  current: QueueToken | null;
  next: QueueToken | null;
  waitingCount: number;
  onBreak: boolean;
  busy: boolean;
  onCallNext: () => void;
  onRecall: (token: QueueToken) => void;
  onSkip: (token: QueueToken) => void;
  onNoShow: (token: QueueToken) => void;
};

/** One doctor at the desk: who is with the doctor, who is next, and the buttons. */
export const DeskNowServing = ({ current, next, waitingCount, onBreak, busy, onCallNext, onRecall, onSkip, onNoShow }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const minutes = minutesWithDoctor(current);

  const confirmNoShow = (token: QueueToken) =>
    Alert.alert('Mark as no-show?', `Token ${token.token_number} (${token.patient_name ?? 'patient'}) didn't come in.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'No-show', style: 'destructive', onPress: () => onNoShow(token) },
    ]);

  return (
    <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
      <AppText variant="label" tone="secondary" weight="700">
        {current ? 'NOW SERVING' : 'READY FOR NEXT PATIENT'}
      </AppText>

      <View style={[styles.row, { marginTop: spacing.md }]}>
        <View style={[styles.token, { backgroundColor: current ? colors.primary : colors.surfaceSunken, borderRadius: radius.lg }]}>
          <AppText variant="caption" weight="700" style={{ color: current ? colors.onPrimary : colors.textSecondary }}>
            TOKEN
          </AppText>
          <AppText variant="display" weight="800" style={{ color: current ? colors.onPrimary : colors.textTertiary }}>
            {current?.token_number ?? '—'}
          </AppText>
        </View>
        <View style={[styles.flex, { marginStart: spacing.md }]}>
          <AppText variant="section" numberOfLines={2}>
            {current ? current.patient_name || 'Patient' : `${waitingCount} waiting`}
          </AppText>
          {current?.phone ? (
            <AppText variant="label" tone="secondary">
              {current.phone}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="secondary">
            {current
              ? minutes !== null
                ? `With the doctor for ${minutes} min`
                : 'Called'
              : next
                ? `Next: token ${next.token_number}${next.patient_name ? ` · ${next.patient_name}` : ''}`
                : 'Nobody is waiting'}
          </AppText>
        </View>
      </View>

      <AppButton
        title={onBreak ? 'On a break' : current ? 'Done — call next' : 'Call next'}
        disabled={busy || onBreak || (!current && !next)}
        loading={busy}
        leftIcon={<BellRing size={18} color={colors.onPrimary} />}
        containerStyle={{ marginTop: spacing.lg }}
        onPress={onCallNext}
        accessibilityHint="Completes the patient with the doctor and calls the next token"
      />

      {current && (
        <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.sm }]}>
          {current.status === 'called' && (
            <View style={styles.flex}>
              <AppButton
                title="Call again"
                size="sm"
                variant="outline"
                disabled={busy}
                leftIcon={<Volume2 size={14} color={colors.primary} />}
                onPress={() => onRecall(current)}
              />
            </View>
          )}
          <View style={styles.flex}>
            <AppButton
              title="Skip"
              size="sm"
              variant="outline"
              disabled={busy || current.status !== 'called'}
              leftIcon={<ChevronsRight size={14} color={colors.primary} />}
              onPress={() => onSkip(current)}
            />
          </View>
          <View style={styles.flex}>
            <AppButton
              title="No-show"
              size="sm"
              variant="ghost"
              disabled={busy}
              leftIcon={<UserX size={14} color={colors.primary} />}
              onPress={() => confirmNoShow(current)}
            />
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  token: {
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
});
