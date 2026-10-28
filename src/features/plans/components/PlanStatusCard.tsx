import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { usePlanStatus } from '../hooks/usePlan';
import { MANAGE_ON_WEB, planBannerText } from '../modules';

type Props = { organizationId: string | null | undefined };

/**
 * The clinic's plan, and the trial / renewal banner when there is one.
 * Consumption-only (Google Play): plans are managed on the website, so this
 * says so in plain text, without a link or a buy button.
 */
export const PlanStatusCard = ({ organizationId }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const { data: status } = usePlanStatus(organizationId);
  if (!status) return null;

  const banner = planBannerText(status);
  const tone = !banner ? colors.status.info : status.banner === 'grace' ? colors.status.error : colors.status.warning;

  return (
    <View
      accessibilityRole={banner ? 'alert' : undefined}
      testID="plan-status"
      style={[styles.row, { backgroundColor: tone.bg, borderColor: tone.dot, borderRadius: radius.md, padding: spacing.md }]}
    >
      <CalendarClock size={18} color={tone.fg} />
      <View style={[styles.copy, { marginStart: spacing.sm }]}>
        <AppText variant="label" weight="700" style={{ color: tone.fg }}>
          {banner ? `${status.plan_name} · ${banner}` : `Plan: ${status.plan_name}`}
        </AppText>
        <AppText variant="caption" style={{ color: tone.fg }}>
          {MANAGE_ON_WEB}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
  },
});

export default PlanStatusCard;
