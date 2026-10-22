import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BellRing, CheckCircle2, CircleDot } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AnimatedCard from '../../../../components/ui/AnimatedCard';
import AppButton from '../../../../components/ui/AppButton';
import AppText from '../../../../components/ui/AppText';
import { Card } from '../../../../components/ui/Card';
import { scaleFont } from '../../../../utils/responsive';
import { MetricRow } from './MetricRow';
import { TokenBoxes } from './TokenBoxes';
import type { QueueStatusView } from './queueStatusView';

type Props = {
  view: QueueStatusView;
  tokenNumber: number | null | undefined;
  checkingIn: boolean;
  cancelling: boolean;
  onCheckIn: () => void;
  onCancel: () => void;
};

export const TokenMetricsCard = ({ view, tokenNumber, checkingIn, cancelling, onCheckIn, onCancel }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const statusTone = view.queueStatusTone === 'warning' ? colors.warning : view.queueStatusTone === 'primary' ? colors.primary : undefined;

  return (
    <AnimatedCard delay={120}>
      <Card padding="md" style={{ marginBottom: spacing.lg }}>
        <TokenBoxes
          left={{ label: 'Current token', value: view.currentServingToken != null ? `A-${view.currentServingToken}` : '--' }}
          right={{ label: 'Your token', value: tokenNumber != null ? `A-${tokenNumber}` : '--' }}
        />

        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <MetricRow
            icon={CircleDot}
            label="Service Avg. Time"
            value={view.doctorAverageTime != null ? `${Math.round(view.doctorAverageTime)} min` : '--'}
            divider
          />
          <MetricRow icon={BellRing} label="Status" value={view.queueStatusLabel} tone={statusTone} />
        </View>

        {view.canCheckIn && (
          <AppButton
            title="I'm Here — Check In"
            loading={checkingIn}
            onPress={onCheckIn}
            style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}
          />
        )}
        {view.canCancel && (
          <AppButton
            title="Cancel Appointment"
            variant="danger"
            loading={cancelling}
            disabled={checkingIn || cancelling}
            onPress={onCancel}
            style={{ marginTop: view.canCheckIn ? 0 : spacing.lg }}
          />
        )}
        {view.status === 'checked_in' && (
          <View
            style={[
              styles.note,
              { marginTop: spacing.lg, backgroundColor: colors.tint.primary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
            ]}
          >
            <CheckCircle2 color={colors.primary} size={scaleFont(18)} />
            <AppText variant="label" tone="brand" weight="700" style={styles.flex}>
              Checked in successfully. Keep this screen open for live updates.
            </AppText>
          </View>
        )}
      </Card>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
