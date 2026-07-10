import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, Pressable, Modal, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Edit2, Trash2, Hospital, Stethoscope, ChevronLeft, X, UserPlus, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { doctorsService } from '../../appointments/api/doctorsService';
import type { Doctor } from '../../appointments/api/doctorsService';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { toastService } from '../../../services/toastService';
import { centerService } from '../../../services/centerService';
import { serviceService } from '../../../services/serviceService';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';

type ManageCentersScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'ManageCenters'>;

interface Center {
  id: string;
  name: string;
  city: string;
  address: string;
  open_time: string | null;
  close_time: string | null;
  category: string | null;
}

interface Service {
  id: string;
  name: string;
  avg_duration_mins: number;
  category: string;
  on_duty_note?: string | null;
}

const ManageCentersScreen = () => {
  const navigation = useNavigation<ManageCentersScreenNavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const [activeTab, setActiveTab] = useState<'centers' | 'services'>('centers');
  const [centers, setCenters] = useState<Center[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Center form fields
  const [centerName, setCenterName] = useState('');
  const [centerCity, setCenterCity] = useState('');
  const [centerAddress, setCenterAddress] = useState('');
  const [centerOpenTime, setCenterOpenTime] = useState('09:00 AM');
  const [centerCloseTime, setCenterCloseTime] = useState('05:00 PM');
  const [centerCategory, setCenterCategory] = useState('General');

  // Service form fields
  const [serviceName, setServiceName] = useState('');
  const [serviceAvgDuration, setServiceAvgDuration] = useState('30');
  const [serviceCategory, setServiceCategory] = useState('General');
  const [serviceOnDutyNote, setServiceOnDutyNote] = useState('');

  // Doctor state (for service edit modal)
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [doctorSpec, setDoctorSpec] = useState('');
  const [doctorFormLoading, setDoctorFormLoading] = useState(false);

  const fetchCenters = useCallback(async () => {
    try {
      const data = await centerService.getCenters();
      const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
      setCenters(sorted);
    } catch (err: any) {
      toastService.error('Failed to load centers: ' + err.message);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const data = await serviceService.getServices();
      const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
      setServices(sorted);
    } catch (err: any) {
      toastService.error('Failed to load services: ' + err.message);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (activeTab === 'centers') {
      await fetchCenters();
    } else {
      await fetchServices();
    }
    setLoading(false);
  }, [activeTab, fetchCenters, fetchServices]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingId(null);
    if (activeTab === 'centers') {
      setCenterName('');
      setCenterCity('');
      setCenterAddress('');
      setCenterOpenTime('09:00 AM');
      setCenterCloseTime('05:00 PM');
      setCenterCategory('General');
    } else {
      setServiceName('');
      setServiceAvgDuration('30');
      setServiceCategory('General');
      setServiceOnDutyNote('');
    }
    setShowModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingId(item.id);
    if (activeTab === 'centers') {
      setCenterName(item.name || '');
      setCenterCity(item.city || '');
      setCenterAddress(item.address || '');
      setCenterOpenTime(item.open_time || '09:00 AM');
      setCenterCloseTime(item.close_time || '05:00 PM');
      setCenterCategory(item.category || 'General');
    } else {
      setServiceName(item.name || '');
      setServiceAvgDuration(String(item.avg_duration_mins || 30));
      setServiceCategory(item.category || 'General');
      setServiceOnDutyNote(item.on_duty_note || '');
      // Load doctors for this service
      setDoctorsLoading(true);
      doctorsService.getAllByServiceId(item.id).then(data => {
        setDoctors(data);
        setDoctorsLoading(false);
      }).catch(() => {
        setDoctors([]);
        setDoctorsLoading(false);
      });
    }
    setShowDoctorForm(false);
    setShowModal(true);
  };

  const handleOpenAddDoctor = () => {
    setEditingDoctorId(null);
    setDoctorName('');
    setDoctorSpec('');
    setShowDoctorForm(true);
  };

  const handleOpenEditDoctor = (doc: Doctor) => {
    setEditingDoctorId(doc.id);
    setDoctorName(doc.name);
    setDoctorSpec(doc.specialization || '');
    setShowDoctorForm(true);
  };

  const handleSaveDoctor = async () => {
    if (!doctorName.trim()) {
      toastService.error('Doctor name is required');
      return;
    }
    if (!editingId) {
      toastService.error('Save the department first before adding doctors');
      return;
    }
    setDoctorFormLoading(true);
    try {
      if (editingDoctorId) {
        await doctorsService.update(editingDoctorId, {
          name: doctorName.trim(),
          specialization: doctorSpec.trim() || undefined,
        });
        toastService.success('Doctor updated');
      } else {
        await doctorsService.create({
          name: doctorName.trim(),
          specialization: doctorSpec.trim() || undefined,
          service_id: editingId,
        });
        toastService.success('Doctor added');
      }
      const refreshed = await doctorsService.getAllByServiceId(editingId);
      setDoctors(refreshed);
      setShowDoctorForm(false);
    } catch (err: any) {
      toastService.error('Failed to save doctor: ' + err.message);
    } finally {
      setDoctorFormLoading(false);
    }
  };

  const handleDeleteDoctor = (doc: Doctor) => {
    Alert.alert(
      'Remove Doctor',
      `Are you sure you want to remove Dr. ${doc.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await doctorsService.delete(doc.id);
              toastService.success('Doctor removed');
              if (editingId) {
                const refreshed = await doctorsService.getAllByServiceId(editingId);
                setDoctors(refreshed);
              }
            } catch (err: any) {
              toastService.error('Failed to remove: ' + err.message);
            }
          },
        },
      ],
    );
  };

  const handleToggleDoctor = async (doc: Doctor) => {
    try {
      await doctorsService.toggleActive(doc.id, !doc.is_active);
      if (editingId) {
        const refreshed = await doctorsService.getAllByServiceId(editingId);
        setDoctors(refreshed);
      }
    } catch (err: any) {
      toastService.error('Failed to update: ' + err.message);
    }
  };

  const handleSave = async () => {
    if (activeTab === 'centers') {
      if (!centerName.trim() || !centerCity.trim() || !centerAddress.trim()) {
        toastService.error('All fields are required');
        return;
      }

      setLoading(true);
      const payload = {
        name: centerName.trim(),
        city: centerCity.trim(),
        address: centerAddress.trim(),
        open_time: centerOpenTime.trim(),
        close_time: centerCloseTime.trim(),
        category: centerCategory.trim(),
      };

      try {
        if (editingId) {
          await centerService.updateCenter(editingId, payload);
          toastService.success('Center updated successfully');
        } else {
          await centerService.createCenter(payload);
          toastService.success('Center added successfully');
        }
        setShowModal(false);
        fetchCenters();
      } catch (err: any) {
        toastService.error('Failed to save center: ' + err.message);
      } finally {
        setLoading(false);
      }
    } else {
      if (!serviceName.trim() || !serviceAvgDuration.trim()) {
        toastService.error('All fields are required');
        return;
      }

      setLoading(true);
      const payload = {
        name: serviceName.trim(),
        avg_duration_mins: parseInt(serviceAvgDuration.trim(), 10) || 30,
        category: serviceCategory.trim(),
        on_duty_note: serviceOnDutyNote.trim() || null,
      };

      try {
        if (editingId) {
          await serviceService.updateService(editingId, payload);
          toastService.success('Service updated successfully');
        } else {
          await serviceService.createService(payload);
          toastService.success('Service added successfully');
        }
        setShowModal(false);
        fetchServices();
      } catch (err: any) {
        toastService.error('Failed to save service: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Confirmation',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              if (activeTab === 'centers') {
                await centerService.deleteCenter(id);
              } else {
                await serviceService.deleteService(id);
              }
              toastService.success('Deleted successfully');
              loadData();
            } catch (err: any) {
              toastService.error('Failed to delete: ' + err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Back header button */}
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', flex: 1, marginRight: spacing.md }]}>
            Clinics & Services
          </Text>
          <AppButton
            title="Add New"
            onPress={handleOpenAdd}
            containerStyle={{ width: 'auto', marginTop: 0 }}
            style={{ minWidth: 100, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 0 }}
          />
        </View>

        {/* Custom Tab Bar */}
        <View style={[styles.tabBar, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 4 }]}>
          <Pressable
            onPress={() => setActiveTab('centers')}
            style={[
              styles.tab,
              activeTab === 'centers' && { backgroundColor: colors.primary, borderRadius: radius.lg },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'centers' ? '#FFF' : colors.text }]}>Clinics</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('services')}
            style={[
              styles.tab,
              activeTab === 'services' && { backgroundColor: colors.primary, borderRadius: radius.lg },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'services' ? '#FFF' : colors.text }]}>Departments</Text>
          </Pressable>
        </View>

        {/* Scrollable list */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {activeTab === 'centers' ? (
            centers.map(center => (
              <Card key={center.id} style={[styles.itemCard, { padding: spacing.md, borderWidth: 0.5, borderColor: colors.border + '50' }]} containerStyle={{ marginBottom: spacing.md }}>
                <View style={styles.cardInfo}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.primary + '12', borderRadius: radius.md }]}>
                    <Hospital size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardTexts}>
                    <Text style={[styles.itemName, { color: colors.text, fontSize: typography.sizes.md }]}>{center.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600' }}>{center.city} • {center.category}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2, fontWeight: '500' }}>Hours: {center.open_time} - {center.close_time}</Text>
                  </View>
                </View>
                <View style={styles.actionButtons}>
                  <Pressable onPress={() => handleOpenEdit(center)} style={[styles.actionButton, { backgroundColor: colors.border + '15' }]}>
                    <Edit2 size={14} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(center.id, center.name)} style={[styles.actionButton, { backgroundColor: colors.error + '12' }]}>
                    <Trash2 size={14} color={colors.error} />
                  </Pressable>
                </View>
              </Card>
            ))
          ) : (
            services.map(service => (
              <Card key={service.id} style={[styles.itemCard, { padding: spacing.md, borderWidth: 0.5, borderColor: colors.border + '50' }]} containerStyle={{ marginBottom: spacing.md }}>
                <View style={styles.cardInfo}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.info + '12', borderRadius: radius.md }]}>
                    <Stethoscope size={20} color={colors.info} />
                  </View>
                  <View style={styles.cardTexts}>
                    <Text style={[styles.itemName, { color: colors.text, fontSize: typography.sizes.md }]}>{service.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600' }}>Category: {service.category}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2, fontWeight: '500' }}>Avg Duration: {service.avg_duration_mins} mins</Text>
                  </View>
                </View>
                <View style={styles.actionButtons}>
                  <Pressable onPress={() => handleOpenEdit(service)} style={[styles.actionButton, { backgroundColor: colors.border + '15' }]}>
                    <Edit2 size={14} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(service.id, service.name)} style={[styles.actionButton, { backgroundColor: colors.error + '12' }]}>
                    <Trash2 size={14} color={colors.error} />
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </ScrollView>

        {/* Modal form */}
        <Modal
          visible={showModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowModal(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[
                styles.modalContent,
                {
                  backgroundColor: colors.card,
                  borderRadius: radius.xl,
                  padding: spacing.lg,
                  borderColor: colors.border,
                  borderWidth: Platform.OS === 'ios' ? 0 : 1,
                  elevation: 10,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.25,
                  shadowRadius: 20,
                  width: '100%',
                },
              ]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: colors.border + '50' }]}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.lg, fontWeight: '800' }]}>
                  {editingId ? 'Edit' : 'Add New'} {activeTab === 'centers' ? 'Clinic' : 'Department'}
                </Text>
                <Pressable
                  onPress={() => setShowModal(false)}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.closeButton,
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '90%' }}>
                {activeTab === 'centers' ? (
                  <>
                    <AppInput
                      label="Clinic Name"
                      placeholder="Clinic/Hospital Name"
                      value={centerName}
                      onChangeText={setCenterName}
                    />
                    <AppInput
                      label="City"
                      placeholder="City Name"
                      value={centerCity}
                      onChangeText={setCenterCity}
                    />
                    <AppInput
                      label="Address"
                      placeholder="Full Address"
                      value={centerAddress}
                      onChangeText={setCenterAddress}
                    />
                    <AppInput
                      label="Open Time"
                      placeholder="e.g. 09:00 AM"
                      value={centerOpenTime}
                      onChangeText={setCenterOpenTime}
                    />
                    <AppInput
                      label="Close Time"
                      placeholder="e.g. 05:00 PM"
                      value={centerCloseTime}
                      onChangeText={setCenterCloseTime}
                    />
                    <AppInput
                      label="Category"
                      placeholder="e.g. General, Dental"
                      value={centerCategory}
                      onChangeText={setCenterCategory}
                    />
                  </>
                ) : (
                  <>
                    <AppInput
                      label="Department Name"
                      placeholder="Department Name (e.g. Cardiology)"
                      value={serviceName}
                      onChangeText={setServiceName}
                    />
                    <AppInput
                      label="Average Duration (minutes)"
                      placeholder="e.g. 30"
                      value={serviceAvgDuration}
                      onChangeText={setServiceAvgDuration}
                      keyboardType="numeric"
                    />
                    <AppInput
                      label="Category"
                      placeholder="e.g. General, Surgery"
                      value={serviceCategory}
                      onChangeText={setServiceCategory}
                    />
                    <AppInput
                      label="On-duty note (optional)"
                      placeholder="e.g. Dr. Ahmed on duty today"
                      value={serviceOnDutyNote}
                      onChangeText={setServiceOnDutyNote}
                      multiline
                    />

                    {/* Doctors subsection — only visible when editing an existing department */}
                    {!!editingId && (
                      <View style={{ marginTop: spacing.md }}>
                        <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: spacing.md }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Stethoscope size={15} color={colors.primary} />
                            <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800' }}>
                              Doctors
                            </Text>
                            {doctorsLoading && (
                              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>(loading...)</Text>
                            )}
                          </View>
                          {!showDoctorForm && (
                            <Pressable
                              onPress={handleOpenAddDoctor}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.md, backgroundColor: colors.primary + '12' }}
                            >
                              <UserPlus size={13} color={colors.primary} />
                              <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>Add Doctor</Text>
                            </Pressable>
                          )}
                        </View>

                        {/* Doctor list */}
                        {doctors.length === 0 && !doctorsLoading && !showDoctorForm && (
                          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm }}>
                            No doctors yet. Tap "Add Doctor" to assign one.
                          </Text>
                        )}
                        {doctors.map(doc => (
                          <View
                            key={doc.id}
                            style={[styles.doctorRow, { borderColor: colors.border + '50', backgroundColor: colors.surface }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700' }}>{doc.name}</Text>
                              {!!doc.specialization && (
                                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{doc.specialization}</Text>
                              )}
                            </View>
                            <Pressable onPress={() => handleToggleDoctor(doc)} style={{ marginRight: 8 }}>
                              {doc.is_active
                                ? <ToggleRight size={22} color={colors.success} />
                                : <ToggleLeft size={22} color={colors.textSecondary} />
                              }
                            </Pressable>
                            <Pressable onPress={() => handleOpenEditDoctor(doc)} style={{ marginRight: 8 }}>
                              <Edit2 size={15} color={colors.primary} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteDoctor(doc)}>
                              <Trash2 size={15} color={colors.error} />
                            </Pressable>
                          </View>
                        ))}

                        {/* Inline Add/Edit doctor form */}
                        {showDoctorForm && (
                          <View style={[styles.doctorForm, { borderColor: colors.border + '50', backgroundColor: colors.primary + '04' }]}>
                            <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.sm }}>
                              {editingDoctorId ? 'Edit Doctor' : 'New Doctor'}
                            </Text>
                            <AppInput
                              label="Doctor Name"
                              placeholder="e.g. Dr. Sarah Khan"
                              value={doctorName}
                              onChangeText={setDoctorName}
                            />
                            <AppInput
                              label="Specialization (optional)"
                              placeholder="e.g. Cardiologist"
                              value={doctorSpec}
                              onChangeText={setDoctorSpec}
                            />
                            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                              <AppButton
                                title={editingDoctorId ? 'Update' : 'Add'}
                                onPress={handleSaveDoctor}
                                loading={doctorFormLoading}
                                containerStyle={{ flex: 1, marginTop: 0 }}
                                style={{ flex: 1 }}
                              />
                              <AppButton
                                title="Cancel"
                                variant="outline"
                                onPress={() => setShowDoctorForm(false)}
                                disabled={doctorFormLoading}
                                containerStyle={{ flex: 1, marginTop: 0 }}
                                style={{ flex: 1 }}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                )}

                <View style={styles.modalButtons}>
                  <AppButton
                    title="Save"
                    onPress={handleSave}
                    containerStyle={{ flex: 1, marginTop: 0 }}
                    style={{ flex: 1 }}
                    loading={loading}
                  />
                  <AppButton
                    title="Cancel"
                    onPress={() => setShowModal(false)}
                    variant="outline"
                    containerStyle={{ flex: 1, marginTop: 0 }}
                    style={{ flex: 1 }}
                    disabled={loading}
                  />
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ScreenWrapper>
  );
};

export default ManageCentersScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {},
  tabBar: {
    flexDirection: 'row',
    borderWidth: 1.2,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabText: {
    fontWeight: '800',
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: {
    marginLeft: 12,
    flex: 1,
  },
  itemName: {
    fontWeight: '800',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    maxHeight: '95%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {},
  closeButton: {
    padding: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingBottom: 10,
  },
  divider: {
    height: 1,
    marginBottom: 4,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  doctorForm: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
});
