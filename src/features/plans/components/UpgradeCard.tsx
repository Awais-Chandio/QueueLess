import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { MANAGE_ON_WEB, MODULE_INFO, PLANS_WITH, type PlanModule } from '../modules';

type Props = {
  module: PlanModule;
  /** Owners can ask for the upgrade themselves; staff are told to ask the owner. */
  isOwner?: boolean;
};

/**
 * Shown in place of a feature the clinic's plan doesn't include. The app is
 * consumption-only (Google Play): no purchase button and no link; owners
 * manage the plan on the website.
 */
export const UpgradeCard = ({ module, isOwner = false }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const info = MODULE_INFO[module];
  const plans = PLANS_WITH[module].filter(name => name !== 'Basic');

  return (
    <Card variant="outlined" padding="md" accessibilityLabel={`${info.title} needs an upgrade`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.tint.primary, borderRadius: radius.md }]}>
          <Lock size={18} color={colors.primary} />
        </View>
        <View style={[styles.copy, { marginStart: spacing.md }]}>
          <AppText variant="bodyStrong">{info.title}</AppText>
          <AppText variant="caption" tone="secondary">
            {info.pitch}
          </AppText>
          <AppText variant="caption" tone="brand" weight="600" style={{ marginTop: spacing.xs }}>
            {`On ${plans.join(' / ')}`}
            {isOwner ? ` · ${MANAGE_ON_WEB}` : ' · ask the clinic owner.'}
          </AppText>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
});

export default UpgradeCard;
