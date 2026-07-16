import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import { AvailabilityCard } from '../components/AvailabilityCard';
import { DayScheduleCard } from '../components/DayScheduleCard';
import { useNavigation } from '@react-navigation/native';
import { AlertCircle, Calendar, X } from 'lucide-react-native';

interface EditingDay {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}

export default function AvailabilityScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const navigation = useNavigation<any>();
  const {
    isLoading,
    error,
    isOnBreak,
    schedule,
    toggleBreakMode,
    updateDaySchedule,
    refresh,
  } = useDoctorAvailability();

  const [editingDay, setEditingDay] = useState<EditingDay | null>(null);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [slotDurationInput, setSlotDurationInput] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  const handleRefresh = React.useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleOpenEdit = (day: typeof schedule[0]) => {
    setEditingDay({
      id: day.id,
      dayOfWeek: day.day_of_week,
      startTime: day.start_time || '09:00:00',
      endTime: day.end_time || '17:00:00',
      slotDuration: day.slot_duration || 15,
    });
    // Truncate seconds from time strings for input (e.g. 09:00:00 -> 09:00)
    setStartTimeInput((day.start_time || '09:00:00').substring(0, 5));
    setEndTimeInput((day.end_time || '17:00:00').substring(0, 5));
    setSlotDurationInput((day.slot_duration || 15).toString());
  };

  const handleSaveHours = async () => {
    if (!editingDay) return;
    
    // Quick validation of HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTimeInput) || !timeRegex.test(endTimeInput)) {
      Alert.alert('Error', 'Please enter valid times in 24-hour HH:MM format (e.g., 09:00, 13:00).');
      return;
    }

    const duration = parseInt(slotDurationInput, 10);
    if (isNaN(duration) || duration <= 0) {
      Alert.alert('Error', 'Please enter a valid slot duration in minutes.');
      return;
    }

    try {
      setSaveLoading(true);
      await updateDaySchedule(editingDay.id, {
        start_time: `${startTimeInput}:00`,
        end_time: `${endTimeInput}:00`,
        slot_duration: duration,
        is_available: true,
      });
      setEditingDay(null);
    } catch {
      Alert.alert('Error', 'Failed to update schedule hours. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleDay = async (day: typeof schedule[0], value: boolean) => {
    try {
      await updateDaySchedule(day.id, {
        start_time: day.start_time || '09:00:00',
        end_time: day.end_time || '17:00:00',
        slot_duration: day.slot_duration || 15,
        is_available: value,
      });
    } catch {
      Alert.alert('Error', 'Failed to update availability. Please try again.');
    }
  };

  if (isLoading && schedule.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && schedule.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <AlertCircle size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
        <Text style={[styles.errorText, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
            Availability Management
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Set your real-time clinic status and weekly working schedule.
          </Text>
        </View>

        {/* Break Mode Card */}
        <AvailabilityCard
          isOnBreak={isOnBreak}
          onToggleBreak={toggleBreakMode}
        />

        {/* Leaves Shortcut Button */}
        <TouchableOpacity
          style={[styles.leavesButton, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20', borderRadius: radius.xl }]}
          onPress={() => navigation.navigate('LeaveManagement')}
        >
          <Calendar size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={[styles.leavesButtonText, { color: colors.primary, fontSize: typography.sizes.sm }]}>
            Manage Leaves / Off Days
          </Text>
        </TouchableOpacity>

        {/* Weekly Schedule Title */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
          Weekly Consultation Schedule
        </Text>

        {/* Days List */}
        {schedule.map(day => (
          <DayScheduleCard
            key={day.id}
            dayOfWeek={day.day_of_week}
            startTime={day.start_time || ''}
            endTime={day.end_time || ''}
            slotDuration={day.slot_duration}
            isAvailable={day.is_available}
            onToggle={(val) => handleToggleDay(day, val)}
            onEdit={() => handleOpenEdit(day)}
          />
        ))}
      </ScrollView>

      {/* Edit Hours Modal */}
      <Modal
        visible={editingDay !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingDay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Configure Hours
              </Text>
              <TouchableOpacity onPress={() => setEditingDay(null)} style={styles.closeButton}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Start Time */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                Start Time (24h format - HH:MM)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
                value={startTimeInput}
                onChangeText={setStartTimeInput}
                placeholder="09:00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* End Time */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                End Time (24h format - HH:MM)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
                value={endTimeInput}
                onChangeText={setEndTimeInput}
                placeholder="13:00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Slot Duration */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                Slot Duration (Minutes)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
                value={slotDurationInput}
                onChangeText={setSlotDurationInput}
                keyboardType="numeric"
                placeholder="15"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: radius.lg }]}
                onPress={() => setEditingDay(null)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
                onPress={handleSaveHours}
                disabled={saveLoading}
              >
                {saveLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.saveBtnText, { fontSize: typography.sizes.sm }]}>
                    Save Changes
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    textAlign: 'center',
    fontWeight: '500',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '500',
  },
  leavesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 20,
  },
  leavesButtonText: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formRow: {
    marginBottom: 14,
  },
  inputLabel: {
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
