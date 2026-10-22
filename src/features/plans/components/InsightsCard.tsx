import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { hasModule } from '../modules';
import { useClinicInsights } from '../hooks/usePlan';
import { UpgradeCard } from './UpgradeCard';
import type { PlanSummary } from '../../queue/api/queueRpc';

type Props = { centerId: string | null | undefined; plan: PlanSummary | null | undefined; isOwner?: boolean };

/** Last 7 days at a glance on Pro / Center; an Upgrade card on other plans. */
export const InsightsCard = ({ centerId, plan, isOwner }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const enabled = hasModule(plan, 'analytics');
  const { data, isLoading, isError } = useClinicInsights(centerId, enabled);

  if (!plan) return null;
  if (!enabled) return <UpgradeCard module="analytics" isOwner={isOwner} />;
  if (isError) return null;

  const minutes = (n: number | null | undefined) => (n == null ? '–' : `${n} min`);
  const items = data
    ? [
        { label: 'Patients', value: String(data.totals.tokens) },
        { label: 'Seen', value: String(data.totals.seen) },
        { label: 'Avg wait', value: minutes(data.totals.avg_wait_minutes) },
        { label: 'Avg visit', value: minutes(data.totals.avg_consult_minutes) },
      ]
    : [];

  return (
    <Card variant="outlined" padding="md">
      <View style={[styles.row, { marginBottom: spacing.sm }]}>
        <View style={[styles.icon, { backgroundColor: colors.tint.primary, borderRadius: radius.md }]}>
          <BarChart3 size={18} color={colors.primary} />
        </View>
        <AppText variant="subtitle" style={{ marginLeft: spacing.sm }}>
          Last 7 days
        </AppText>
      </View>
      {isLoading || !data ? (
        <Skeleton height={48} borderRadius={radius.md} />
      ) : (
        <View style={[styles.row, { gap: spacing.sm }]}>
          {items.map(item => (
            <View key={item.label} style={styles.flex}>
              <AppText variant="section">{item.value}</AppText>
              <AppText variant="caption" tone="secondary">
                {item.label}
              </AppText>
            </View>
          ))}
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
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
