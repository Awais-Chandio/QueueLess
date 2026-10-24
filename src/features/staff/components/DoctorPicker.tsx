import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import type { ReceptionDoctor } from '../../queue/api/queueRpc';
import { doctorAvailability, isWaiting } from '../../queue/utils/queueState';

type Props = {
  doctors: ReceptionDoctor[];
  selectedId: string | null;
  onSelect: (doctorId: string) => void;
};

/** Doctor tabs with each queue's waiting count; hidden for a one-doctor clinic. */
export const DoctorPicker = ({ doctors, selectedId, onSelect }: Props) => {
  const { colors, spacing, radius } = useTheme();
  if (doctors.length < 2) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
      {doctors.map(doctor => {
        const selected = doctor.id === selectedId;
        const waiting = doctor.tokens.filter(isWaiting).length;
        const availability = doctorAvailability(doctor);
        const dot =
          availability.kind === 'break' ? colors.status.doctor_on_break.dot : availability.kind === 'late' ? colors.warning : colors.success;
        return (
          <Pressable
            key={doctor.id}
            onPress={() => onSelect(doctor.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.tint.primary : colors.surface,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <AppText variant="label" weight={selected ? '700' : '500'} tone={selected ? 'brand' : 'primary'} numberOfLines={1}>
              {doctor.name}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginStart: spacing.xs }}>
              {waiting}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginEnd: 6,
  },
});
