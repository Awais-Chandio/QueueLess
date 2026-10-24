import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { tokenLimit, tokenLimitMessage } from '../modules';

type Props = {
  tokensToday: number;
  tokensPerDay: number | null | undefined;
};

/** Free plan: warns the desk near the daily token limit and says what happens at it. */
export const PlanLimitBanner = ({ tokensToday, tokensPerDay }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const limit = tokenLimit(tokensToday, tokensPerDay);
  const message = tokenLimitMessage(limit);
  if (!message) return null;

  const reached = limit.level === 'reached';
  const tone = reached ? colors.status.error : colors.status.warning;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.row, { backgroundColor: tone.bg, borderRadius: radius.md, padding: spacing.md, borderColor: tone.dot }]}
    >
      <AlertTriangle size={18} color={tone.fg} />
      <View style={[styles.copy, { marginStart: spacing.sm }]}>
        <AppText variant="label" weight="700" style={{ color: tone.fg }}>
          {reached ? 'Daily token limit reached' : 'Free plan limit'}
        </AppText>
        <AppText variant="caption" style={{ color: tone.fg }}>
          {message}
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

export default PlanLimitBanner;
