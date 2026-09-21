import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { DoctorSheet } from './DoctorSheet';
import { formatDateKey, parseDateKey, toDateKey } from '../utils/doctorFormat';
import { useSaveVisitSummary, useVisitSummary } from '../../../hooks/useVisitSummary';
import {
  DIAGNOSIS_MAX,
  INSTRUCTIONS_MAX,
  MAX_MEDICINES,
  MEDICINE_FIELD_MAX,
  MEDICINE_NAME_MAX,
  NOTES_MAX,
} from '../../../services/visitSummaryService';
import type { AppointmentFull } from '../../../types/appointment';

type Props = {
  visible: boolean;
  appointment: AppointmentFull | null;
  onClose: () => void;
};

type MedicineRow = {
  key: number;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Doctor's form for a completed visit: diagnosis, a dynamic medicine list,
 * notes and an optional follow-up date. Opening it on a visit that already has
 * a summary loads it for editing; saving always goes through the same upsert.
 */
export const VisitSummarySheet = ({ visible, appointment, onClose }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const appointmentId = appointment?.id;
  const { data: existing, isLoading, isError, refetch } = useVisitSummary(appointmentId, visible);
  const save = useSaveVisitSummary();

  const nextKey = useRef(0);
  const newRow = (): MedicineRow => ({
    key: nextKey.current++,
    medicine_name: '',
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
  });

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<MedicineRow[]>([]);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Fill the form once per opening. A background refetch must not overwrite
  // what the doctor is typing.
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      filledFor.current = null;
      setPickerOpen(false);
      return;
    }
    if (isLoading || isError || filledFor.current === appointmentId) return;
    filledFor.current = appointmentId ?? null;
    setDiagnosis(existing?.diagnosis ?? '');
    setNotes(existing?.notes ?? '');
    setFollowUp(existing?.follow_up_date ?? null);
    setRows(
      existing && existing.prescription_items.length > 0
        ? existing.prescription_items.map(item => ({
            key: nextKey.current++,
            medicine_name: item.medicine_name,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions ?? '',
          }))
        : [],
    );
  }, [visible, isLoading, isError, existing, appointmentId]);

  const updateRow = (key: number, patch: Partial<MedicineRow>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));

  const submit = () => {
    if (!appointmentId) return;
    save.mutate(
      {
        appointmentId,
        diagnosis,
        notes,
        followUpDate: followUp,
        items: rows,
      },
      { onSuccess: onClose },
    );
  };

  const isEditing = !!existing;
  const busy = save.isPending;
  const patient = appointment?.patient_name || 'this patient';

  return (
    <DoctorSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={isEditing ? 'Edit visit summary' : 'Visit summary'}
      maxHeightPercent={0.92}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText variant="body" tone="secondary" align="center">
            Couldn't load the existing summary.
          </AppText>
          <AppButton
            title="Try again"
            variant="outline"
            size="sm"
            onPress={() => refetch()}
            containerStyle={{ marginTop: spacing.md }}
          />
        </View>
      ) : (
        <View>
          <AppText variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
            {`Diagnosis and prescription for ${patient}. The patient can read this from their appointment.`}
          </AppText>

          <AppInput
            label="Diagnosis"
            placeholder="e.g. Seasonal allergic rhinitis"
            value={diagnosis}
            onChangeText={setDiagnosis}
            multiline
            maxLength={DIAGNOSIS_MAX}
            editable={!busy}
          />

          <View style={[styles.sectionHeader, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
            <AppText variant="subtitle">Medicines</AppText>
            <AppText variant="caption" tone="secondary">
              {rows.length}/{MAX_MEDICINES}
            </AppText>
          </View>

          {rows.length === 0 && (
            <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
              No medicines added.
            </AppText>
          )}

          {rows.map((row, index) => (
            <View
              key={row.key}
              style={[
                styles.medicine,
                {
                  borderColor: colors.border,
                  borderRadius: radius.control,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <AppText variant="label" weight="600" tone="secondary">
                  {`Medicine ${index + 1}`}
                </AppText>
                <Pressable
                  onPress={() => setRows(current => current.filter(r => r.key !== row.key))}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove medicine ${index + 1}`}
                >
                  <Trash2 size={18} color={colors.error} />
                </Pressable>
              </View>
              <AppInput
                label="Name"
                placeholder="e.g. Cetirizine"
                value={row.medicine_name}
                onChangeText={text => updateRow(row.key, { medicine_name: text })}
                maxLength={MEDICINE_NAME_MAX}
                editable={!busy}
              />
              <View style={[styles.pair, { gap: spacing.sm }]}>
                <View style={styles.half}>
                  <AppInput
                    label="Dosage"
                    placeholder="10 mg"
                    value={row.dosage}
                    onChangeText={text => updateRow(row.key, { dosage: text })}
                    maxLength={MEDICINE_FIELD_MAX}
                    editable={!busy}
                  />
                </View>
                <View style={styles.half}>
                  <AppInput
                    label="Frequency"
                    placeholder="Twice daily"
                    value={row.frequency}
                    onChangeText={text => updateRow(row.key, { frequency: text })}
                    maxLength={MEDICINE_FIELD_MAX}
                    editable={!busy}
                  />
                </View>
              </View>
              <AppInput
                label="Duration"
                placeholder="e.g. 7 days"
                value={row.duration}
                onChangeText={text => updateRow(row.key, { duration: text })}
                maxLength={MEDICINE_FIELD_MAX}
                editable={!busy}
              />
              <AppInput
                label="Instructions (optional)"
                placeholder="e.g. After meals"
                value={row.instructions}
                onChangeText={text => updateRow(row.key, { instructions: text })}
                maxLength={INSTRUCTIONS_MAX}
                editable={!busy}
              />
            </View>
          ))}

          <AppButton
            title="Add medicine"
            variant="outline"
            size="sm"
            leftIcon={<Plus size={16} color={colors.primary} />}
            disabled={busy || rows.length >= MAX_MEDICINES}
            onPress={() => setRows(current => [...current, newRow()])}
          />

          <View style={{ marginTop: spacing.lg }}>
            <AppInput
              label="Notes"
              placeholder="Advice, tests to run, warning signs to watch for"
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={NOTES_MAX}
              editable={!busy}
            />
          </View>

          <AppText variant="label" weight="600" style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}>
            Follow-up date (optional)
          </AppText>
          <View style={[styles.sectionHeader, { gap: spacing.sm }]}>
            <Pressable
              onPress={() => setPickerOpen(true)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={followUp ? `Follow-up ${formatDateKey(followUp)}` : 'Choose follow-up date'}
              style={[
                styles.dateField,
                {
                  borderColor: pickerOpen ? colors.primary : colors.border,
                  borderRadius: radius.control,
                  padding: spacing.md,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <CalendarDays size={16} color={colors.primary} />
              <AppText variant="bodyStrong" style={{ marginLeft: 6 }}>
                {followUp ? formatDateKey(followUp, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No follow-up'}
              </AppText>
            </Pressable>
            {followUp && (
              <Pressable
                onPress={() => {
                  setFollowUp(null);
                  setPickerOpen(false);
                }}
                disabled={busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear follow-up date"
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {pickerOpen && (
            <DateTimePicker
              value={followUp ? parseDateKey(followUp) : startOfToday()}
              mode="date"
              minimumDate={startOfToday()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, date) => {
                if (Platform.OS !== 'ios') setPickerOpen(false);
                if (event.type !== 'set' || !date) return;
                setFollowUp(toDateKey(date));
              }}
            />
          )}

          <AppButton
            title={isEditing ? 'Save changes' : 'Save summary'}
            loading={busy}
            disabled={busy}
            containerStyle={{ marginTop: spacing.xl, marginBottom: spacing.md }}
            onPress={submit}
          />
        </View>
      )}
    </DoctorSheet>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicine: {
    borderWidth: 1,
  },
  pair: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});

export default VisitSummarySheet;
