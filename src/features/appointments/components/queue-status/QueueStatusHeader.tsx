import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AnimatedCard from '../../../../components/ui/AnimatedCard';
import AppText from '../../../../components/ui/AppText';
import { StatusChip, type StatusChipVariant } from '../../../../components/ui/StatusChip';

type Props = {
  title: string;
  status: StatusChipVariant;
  statusLabel: string;
  onBack: () => void;
};

export const QueueStatusHeader = ({ title, status, statusLabel, onBack }: Props) => {
  const { colors, spacing } = useTheme();
  return (
    <AnimatedCard delay={0}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.back, { marginBottom: spacing.sm }, pressed && styles.pressed]}
      >
        <ChevronLeft size={24} color={colors.primary} />
        <AppText variant="subtitle" tone="brand" style={{ marginLeft: spacing.xs }}>
          Back
        </AppText>
      </Pressable>
      <View style={[styles.titleRow, { marginBottom: spacing.lg, gap: spacing.sm }]}>
        <AppText variant="heading">{title}</AppText>
        <StatusChip status={status} label={statusLabel} />
      </View>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
