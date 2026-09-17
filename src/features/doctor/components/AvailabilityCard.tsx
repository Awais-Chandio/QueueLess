import React from 'react';
import { View, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { Coffee, Stethoscope } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';

interface AvailabilityCardProps {
  isOnBreak: boolean;
  busy?: boolean;
  onToggleBreak: (value: boolean) => void;
}

export const AvailabilityCard = ({ isOnBreak, busy = false, onToggleBreak }: AvailabilityCardProps) => {
  const { colors, spacing, radius } = useTheme();
  const tone = isOnBreak ? colors.warning : colors.success;
  const Icon = isOnBreak ? Coffee : Stethoscope;

  return (
    <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
      <View style={styles.row}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: isOnBreak ? colors.tint.warning : colors.tint.success,
              borderRadius: radius.pill,
            },
          ]}
        >
          <Icon size={22} color={tone} />
        </View>
        <View style={styles.text}>
          <AppText variant="subtitle">{isOnBreak ? 'On a break' : 'Seeing patients'}</AppText>
          <AppText variant="caption" tone="secondary">
            {isOnBreak
              ? 'Your queue shows a break to patients and front desk.'
              : 'Patients see you as active in the live queue.'}
          </AppText>
        </View>
        {busy ? <ActivityIndicator color={colors.primary} style={styles.switchSlot} /> : null}
        <Switch
          value={isOnBreak}
          onValueChange={onToggleBreak}
          disabled={busy}
          trackColor={{ false: colors.border, true: colors.warning }}
          thumbColor={colors.surface}
          accessibilityLabel="Break mode"
        />
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  text: {
    flex: 1,
    marginRight: 8,
  },
  switchSlot: {
    marginRight: 8,
  },
});
