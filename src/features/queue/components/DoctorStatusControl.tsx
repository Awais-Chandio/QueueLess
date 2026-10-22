import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, Clock, Coffee, Stethoscope } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Sheet } from '../../../components/ui/Sheet';
import type { DoctorState } from '../api/queueRpc';
import { LATE_OPTIONS, availabilityLabel, doctorAvailability } from '../utils/queueState';

type Props = {
  doctor: Pick<DoctorState, 'name' | 'is_on_break' | 'late_until'>;
  busy: boolean;
  onSetLate: (minutes: number) => void;
  onSetBreak: (onBreak: boolean) => void;
  /** "You" on the doctor's own phone, the doctor's name at the desk. */
  subject?: 'self' | 'desk';
};

/**
 * "Late / break" for one doctor. Whatever is chosen shows on the TV, the join
 * page and every patient's status page within seconds (the database nudges the
 * displays), and late minutes are added to the waiting patients' ETAs.
 */
export const DoctorStatusControl = ({ doctor, busy, onSetLate, onSetBreak, subject = 'self' }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const availability = doctorAvailability(doctor);
  const tone =
    availability.kind === 'break' ? colors.status.doctor_on_break : availability.kind === 'late' ? colors.status.warning : colors.status.completed;
  const Icon = availability.kind === 'break' ? Coffee : availability.kind === 'late' ? Clock : Stethoscope;
  const who = subject === 'self' ? "I'm" : `${doctor.name} is`;

  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${availabilityLabel(availability)}. Change late or break`}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: tone.bg,
            borderColor: tone.dot,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            opacity: pressed || busy ? 0.7 : 1,
          },
        ]}
      >
        <Icon size={14} color={tone.fg} />
        <AppText variant="label" weight="700" style={{ color: tone.fg, marginLeft: spacing.xs }}>
          {availabilityLabel(availability)}
        </AppText>
        <ChevronDown size={14} color={tone.fg} style={{ marginLeft: spacing.xs }} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Late / break" maxHeightPercent={0.75}>
        <AppText variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
          Patients see this on the TV and their token page. Late minutes are added to their waiting time.
        </AppText>

        <AppText variant="label" weight="700" style={{ marginBottom: spacing.sm }}>
          {`${who} running late by`}
        </AppText>
        <View style={[styles.grid, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {LATE_OPTIONS.map(minutes => (
            <AppButton
              key={minutes}
              title={`${minutes} min`}
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => choose(() => onSetLate(minutes))}
            />
          ))}
        </View>

        {availability.kind === 'break' ? (
          <AppButton title="End break" disabled={busy} onPress={() => choose(() => onSetBreak(false))} />
        ) : (
          <AppButton
            title="Take a break"
            variant="secondary"
            disabled={busy}
            leftIcon={<Coffee size={16} color={colors.primary} />}
            onPress={() => choose(() => onSetBreak(true))}
          />
        )}
        {availability.kind === 'late' && (
          <AppButton
            title={subject === 'self' ? "I'm here now" : 'Doctor has arrived'}
            variant="ghost"
            disabled={busy}
            containerStyle={{ marginTop: spacing.sm }}
            onPress={() => choose(() => onSetLate(0))}
          />
        )}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 32,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default DoctorStatusControl;
