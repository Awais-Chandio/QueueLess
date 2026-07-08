import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, Pressable, Modal, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus, Edit2, Trash2, Hospital, Stethoscope, ChevronLeft, X } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { supabase } from '../../../lib/supabase';
import { toastService } from '../../../services/toastService';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';

type ManageCentersScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'ManageCenters'>;

interface Center {
  id: string;
  name: string;
  city: string;
  address: string;
  open_time: string;
  close_time: string;
  category: string;
}

interface Service {
  id: string;
  name: string;
  avg_duration_mins: number;
  category: string;
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

  const fetchCenters = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('service_centers').select('*').order('name');
      if (error) throw error;
      setCenters(data || []);
    } catch (err: any) {
      toastService.error('Failed to load centers: ' + err.message);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('services').select('*').order('name');
      if (error) throw error;
      setServices(data || []);
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
    }
    setShowModal(true);
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
          const { error } = await supabase.from('service_centers').update(payload).eq('id', editingId);
          if (error) throw error;
          toastService.success('Center updated successfully');
        } else {
          const { error } = await supabase.from('service_centers').insert(payload);
          if (error) throw error;
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
      };

      try {
        if (editingId) {
          const { error } = await supabase.from('services').update(payload).eq('id', editingId);
          if (error) throw error;
          toastService.success('Service updated successfully');
        } else {
          const { error } = await supabase.from('services').insert(payload);
          if (error) throw error;
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
              const table = activeTab === 'centers' ? 'service_centers' : 'services';
              const { error } = await supabase.from(table).delete().eq('id', id);
              if (error) throw error;
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
        <View style={[styles.tabBar, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <Pressable
            onPress={() => setActiveTab('centers')}
            style={[
              styles.tab,
              activeTab === 'centers' && { backgroundColor: colors.primary, borderRadius: radius.md },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'centers' ? '#FFF' : colors.text }]}>Clinics</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('services')}
            style={[
              styles.tab,
              activeTab === 'services' && { backgroundColor: colors.primary, borderRadius: radius.md },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'services' ? '#FFF' : colors.text }]}>Services</Text>
          </Pressable>
        </View>

        {/* Scrollable list */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {activeTab === 'centers' ? (
            centers.map(center => (
              <Card key={center.id} style={styles.itemCard}>
                <View style={styles.cardInfo}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.primary + '10' }]}>
                    <Hospital size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardTexts}>
                    <Text style={[styles.itemName, { color: colors.text, fontSize: typography.sizes.md }]}>{center.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '500' }}>{center.city} • {center.category}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2 }}>Hours: {center.open_time} - {center.close_time}</Text>
                  </View>
                </View>
                <View style={styles.actionButtons}>
                  <Pressable onPress={() => handleOpenEdit(center)} style={[styles.actionButton, { backgroundColor: colors.border + '15' }]}>
                    <Edit2 size={14} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(center.id, center.name)} style={[styles.actionButton, { backgroundColor: colors.error + '10' }]}>
                    <Trash2 size={14} color={colors.error} />
                  </Pressable>
                </View>
              </Card>
            ))
          ) : (
            services.map(service => (
              <Card key={service.id} style={styles.itemCard}>
                <View style={styles.cardInfo}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.info + '10' }]}>
                    <Stethoscope size={20} color={colors.info} />
                  </View>
                  <View style={styles.cardTexts}>
                    <Text style={[styles.itemName, { color: colors.text, fontSize: typography.sizes.md }]}>{service.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '500' }}>Category: {service.category}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2 }}>Avg Duration: {service.avg_duration_mins} mins</Text>
                  </View>
                </View>
                <View style={styles.actionButtons}>
                  <Pressable onPress={() => handleOpenEdit(service)} style={[styles.actionButton, { backgroundColor: colors.border + '15' }]}>
                    <Edit2 size={14} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(service.id, service.name)} style={[styles.actionButton, { backgroundColor: colors.error + '10' }]}>
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
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.lg, fontWeight: '800' }]}>
                  {editingId ? 'Edit' : 'Add New'} {activeTab === 'centers' ? 'Clinic' : 'Service'}
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
                      label="Service Name"
                      placeholder="Service Name (e.g. Consultation)"
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
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
  },
  addButton: {
    minWidth: 100,
  },
  tabBar: {
    flexDirection: 'row',
    borderWidth: 1.5,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: {
    marginLeft: 12,
    flex: 1,
  },
  itemName: {
    fontWeight: '700',
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
  modalTitle: {
  },
  closeButton: {
    padding: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingBottom: 10,
  },
});
