import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, Stethoscope, X } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { doctorService } from '../../../services/doctorService';
import type { Doctor } from '../../../services/doctorService';
import { toastService } from '../../../services/toastService';

type Props = {
  serviceId: string;
};

const MAX_RESULTS = 8;

/**
 * Assigns existing doctors to a service through the doctor_services junction.
 * Doctor records themselves are managed from Manage Doctors, never from here.
 */
const ServiceDoctorAssignment = ({ serviceId }: Props) => {
  const { colors, spacing, typography, radius } = useTheme();

  const [assigned, setAssigned] = useState<Doctor[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyDoctorId, setBusyDoctorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [assignedRows, doctorRows] = await Promise.all([
        doctorService.getAllByServiceId(serviceId),
        doctorService.getAllDoctors(),
      ]);
      setAssigned(assignedRows);
      setAllDoctors(doctorRows);
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load doctors.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(() => {
    const assignedIds = new Set(assigned.map(doctor => doctor.id));
    const term = query.trim().toLowerCase();
    return allDoctors
      .filter(doctor => !assignedIds.has(doctor.id))
      .filter(
        doctor =>
          !term ||
          doctor.name.toLowerCase().includes(term) ||
          (doctor.specialty || '').toLowerCase().includes(term),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_RESULTS);
  }, [allDoctors, assigned, query]);

  const handleAssign = async (doctor: Doctor) => {
    setBusyDoctorId(doctor.id);
    try {
      await doctorService.assignToService(doctor.id, serviceId);
      setAssigned(await doctorService.getAllByServiceId(serviceId));
      setQuery('');
      setPickerOpen(false);
      toastService.success(`${doctor.name} assigned to this service.`);
    } catch (err: any) {
      toastService.error('Unable to assign doctor.', err?.message);
    } finally {
      setBusyDoctorId(null);
    }
  };

  const handleUnassign = (doctor: Doctor) => {
    Alert.alert(
      'Remove from Service',
      `Remove ${doctor.name} from this service? The doctor's account and profile are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyDoctorId(doctor.id);
            try {
              await doctorService.unassignFromService(doctor.id, serviceId);
              setAssigned(current => current.filter(item => item.id !== doctor.id));
              toastService.success(`${doctor.name} removed from this service.`);
            } catch (err: any) {
              toastService.error('Unable to remove doctor.', err?.message);
            } finally {
              setBusyDoctorId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
      <View style={[styles.headerRow, { marginVertical: spacing.sm }]}>
        <Stethoscope size={15} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800' }}>
          Assigned Doctors
        </Text>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      {loadError ? (
        <Pressable onPress={load} accessibilityRole="button">
          <Text style={{ color: colors.error, fontSize: typography.sizes.xs, marginBottom: spacing.sm }}>
            {loadError} Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      {!loading && !loadError && assigned.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm }}>
          No doctors assigned yet. Search below to assign one.
        </Text>
      ) : null}

      {assigned.map(doctor => (
        <View
          key={doctor.id}
          style={[styles.row, { borderColor: colors.border + '50', backgroundColor: colors.surface }]}
        >
          <View style={styles.rowText}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700' }}>
              {doctor.name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
              {doctor.specialty || 'General'}
              {doctor.is_active ? '' : ' · Inactive'}
            </Text>
          </View>
          {busyDoctorId === doctor.id ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Pressable
              onPress={() => handleUnassign(doctor)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${doctor.name} from this service`}
            >
              <X size={16} color={colors.error} />
            </Pressable>
          )}
        </View>
      ))}

      {/* Same search field treatment as DoctorSearchScreen, reached from the Home search bar. */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.card,
            borderColor: pickerOpen ? colors.primary : colors.border,
            borderRadius: radius.lg,
            marginTop: spacing.xs,
          },
        ]}
      >
        <Search size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <TextInput
          placeholder="Search doctors by name or specialty..."
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={text => {
            setQuery(text);
            setPickerOpen(true);
          }}
          onFocus={() => setPickerOpen(true)}
          editable={!loading && !loadError}
          autoCorrect={false}
          accessibilityLabel="Search doctors to assign"
          style={[styles.input, { color: colors.text, fontSize: typography.sizes.sm }]}
        />
        {pickerOpen ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setPickerOpen(false);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close doctor search"
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {pickerOpen ? (
        <View
          style={[
            styles.dropdown,
            { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md },
          ]}
        >
          {results.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, padding: spacing.sm }}>
              {query.trim() ? 'No matching unassigned doctors.' : 'All doctors are already assigned.'}
            </Text>
          ) : (
            results.map((doctor, index) => (
              <Pressable
                key={doctor.id}
                onPress={() => handleAssign(doctor)}
                disabled={busyDoctorId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${doctor.name}`}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    backgroundColor: pressed ? colors.primary + '10' : 'transparent',
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                    {doctor.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                    {[doctor.specialty, doctor.service_centers?.name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {busyDoctorId === doctor.id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
};

export default ServiceDoctorAssignment;

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowText: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1.2,
    height: 48,
  },
  input: {
    flex: 1,
    padding: 0,
    fontWeight: '600',
  },
  dropdown: {
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
