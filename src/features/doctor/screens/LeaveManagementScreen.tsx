import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import { LeaveCard } from '../components/LeaveCard';
import { useNavigation } from '@react-navigation/native';
import { Calendar, Plus, X, ArrowLeft } from 'lucide-react-native';

export default function LeaveManagementScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const navigation = useNavigation();
  const {
    isLoading,
    leaves,
    requestLeaveRange,
    cancelLeave,
    refresh,
  } = useDoctorAvailability();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const handleOpenAdd = () => {
    // Populate today's date in format YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    setStartDate(todayStr);
    setEndDate(todayStr);
    setReason('');
    setAddModalVisible(true);
  };

  const handleSaveLeave = async () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      Alert.alert('Error', 'Please enter valid dates in YYYY-MM-DD format.');
      return;
    }

    const startVal = new Date(startDate).getTime();
    const endVal = new Date(endDate).getTime();
    if (isNaN(startVal) || isNaN(endVal) || startVal > endVal) {
      Alert.alert('Error', 'End date must be greater than or equal to start date.');
      return;
    }

    try {
      setAddLoading(true);
      await requestLeaveRange(startDate, endDate, reason);
      setAddModalVisible(false);
      Alert.alert('Success', 'Leave requested successfully.');
    } catch {
      Alert.alert('Error', 'Failed to request leave. Please try again.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleCancelLeave = (leaveId: string, dateStr: string) => {
    const formatted = new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    Alert.alert(
      'Cancel Leave',
      `Are you sure you want to cancel your leave on ${formatted}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelLeave(leaveId);
            } catch {
              Alert.alert('Error', 'Failed to cancel leave. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (isLoading && leaves.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 50 : 20 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.md }]}
        >
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
            Leave Management
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Add or cancel your leave dates and vacation days.
          </Text>
        </View>
      </View>

      {/* Leaves List */}
      <FlatList
        data={leaves}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: spacing.xl * 2 }]}
        refreshing={isLoading}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
            <Calendar size={32} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              No requested leaves found.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <LeaveCard
            leaveDate={item.leave_date}
            reason={item.reason}
            onCancel={() => handleCancelLeave(item.id, item.leave_date)}
          />
        )}
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.xl }]}
        onPress={handleOpenAdd}
      >
        <Plus size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* Add Leave Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Add Leave Date(s)
              </Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.closeButton}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Start Date */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                Start Date (YYYY-MM-DD)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* End Date */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                End Date (YYYY-MM-DD)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Reason */}
            <View style={styles.formRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                Reason for Leave
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md, height: 60 }]}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="e.g., Medical checkup, family vacation"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: radius.lg }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
                onPress={handleSaveLeave}
                disabled={addLoading}
              >
                {addLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.saveBtnText, { fontSize: typography.sizes.sm }]}>
                    Request Leave
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
    marginBottom: 2,
  },
  subtitle: {
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderWidth: 1,
    marginTop: 10,
  },
  emptyText: {
    fontWeight: '500',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
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
    minWidth: 120,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
