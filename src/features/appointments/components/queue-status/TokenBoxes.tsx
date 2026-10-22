import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AppText from '../../../../components/ui/AppText';
import { Card } from '../../../../components/ui/Card';

type Box = { label: string; value: string };

/** "Now serving" next to the patient's own (highlighted) token. */
export const TokenBoxes = ({ left, right }: { left: Box; right: Box }) => {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <Card variant="flat" style={[styles.box, { borderRadius: radius.card }]}>
        <AppText variant="caption" tone="secondary" weight="700">
          {left.label.toUpperCase()}
        </AppText>
        <AppText variant="heading" weight="800" style={{ marginTop: spacing.xs }}>
          {left.value}
        </AppText>
      </Card>
      <Card
        variant="flat"
        style={[styles.box, { borderRadius: radius.card, backgroundColor: colors.tint.primary, borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth }]}
      >
        <AppText variant="caption" tone="brand" weight="700">
          {right.label.toUpperCase()}
        </AppText>
        <AppText variant="heading" tone="brand" weight="800" style={{ marginTop: spacing.xs }}>
          {right.value}
        </AppText>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  box: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
});
