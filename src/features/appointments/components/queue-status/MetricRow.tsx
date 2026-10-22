import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AppText from '../../../../components/ui/AppText';
import { scaleFont } from '../../../../utils/responsive';

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Icon and value colour; defaults to the brand colour / body text. */
  tone?: string;
  divider?: boolean;
  /** Label above value (details card) instead of label left, value right (metrics). */
  stacked?: boolean;
};

/** One icon + label + value line, used by the metrics and details cards. */
export const MetricRow = ({ icon: Icon, label, value, tone, divider = false, stacked = false }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const accent = tone ?? colors.primary;

  return (
    <View
      style={[
        styles.row,
        { gap: spacing.sm },
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingBottom: spacing.sm },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.tint.primary, borderRadius: radius.sm }]}>
        <Icon color={accent} size={scaleFont(16)} />
      </View>
      {stacked ? (
        <View style={styles.flex}>
          <AppText variant="caption" tone="secondary" weight="600">
            {label}
          </AppText>
          <AppText variant="bodyStrong" style={tone ? { color: tone } : undefined}>
            {value}
          </AppText>
        </View>
      ) : (
        <>
          <AppText variant="label" tone="secondary" weight="600" style={styles.flex}>
            {label}
          </AppText>
          <AppText variant="bodyStrong" weight="800" style={tone ? { color: tone } : undefined}>
            {value}
          </AppText>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: scaleFont(34),
    height: scaleFont(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
