import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable, Alert, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Search, Stethoscope } from 'lucide-react-native';
import { doctorService, type Doctor } from '../../../services/doctorService';
import DoctorCard from '../../../components/ui/DoctorCard';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import MedicalFAB from '../../../components/ui/MedicalFAB';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { useTheme } from '../../../hooks/useTheme';
import { wp, hp } from '../../../utils/responsive';
import { toastService } from '../../../services/toastService';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';

type ManageDoctorsScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'ManageDoctors'>;

const ManageDoctorsScreen = () => {
  const navigation = useNavigation<ManageDoctorsScreenNavigationProp>();
  const isFocused = useIsFocused();
  const { colors, spacing, typography, radius } = useTheme();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters State
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [selectedCenterId, setSelectedCenterId] = useState('all');

  const fetchDoctors = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await doctorService.getAllDoctors();
      setDoctors(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load doctors');
      toastService.error('Failed to load doctors: ' + (err?.message || ''));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchDoctors();
    }
  }, [isFocused, fetchDoctors]);

  const handleToggleStatus = (doc: Doctor) => {
    const isDoctorActive = doc.status === 'active' || doc.is_active;
    const newStatus = isDoctorActive ? 'inactive' : 'active';
    const newActive = !isDoctorActive;

    Alert.alert(
      isDoctorActive ? 'Deactivate Doctor' : 'Activate Doctor',
      `Are you sure you want to ${isDoctorActive ? 'deactivate' : 'activate'} Dr. ${doc.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isDoctorActive ? 'Deactivate' : 'Activate',
          onPress: async () => {
            try {
              await doctorService.update(doc.id, {
                status: newStatus,
                is_active: newActive,
              });
              toastService.success(`Dr. ${doc.name} has been ${isDoctorActive ? 'deactivated' : 'activated'}.`);
              fetchDoctors();
            } catch (err: any) {
              toastService.error('Failed to update status: ' + err.message);
            }
          },
        },
      ]
    );
  };

  const handleDelete = (doc: Doctor) => {
    Alert.alert(
      'Remove Doctor',
      `Are you sure you want to remove Dr. ${doc.name}? This will mark them as inactive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete: update status to inactive, do not delete database record
              await doctorService.update(doc.id, {
                status: 'inactive',
                is_active: false,
              });
              toastService.success(`Dr. ${doc.name} has been removed.`);
              fetchDoctors();
            } catch (err: any) {
              toastService.error('Failed to remove doctor: ' + err.message);
            }
          },
        },
      ]
    );
  };

  // Dynamic filter lists
  const specialties = useMemo(() => {
    const specs = doctors.map(d => d.specialty).filter(Boolean);
    return ['All', ...new Set(specs)];
  }, [doctors]);

  const centersList = useMemo(() => {
    const map = new Map();
    doctors.forEach(d => {
      if (d.service_centers) {
        map.set(d.service_centers.id, d.service_centers.name);
      }
    });
    return [{ id: 'all', name: 'All Clinics' }, ...Array.from(map.entries()).map(([id, name]) => ({ id, name }))];
  }, [doctors]);

  // Filtering Logic
  const filteredDoctors = useMemo(() => {
    return doctors.filter(doc => {
      // 1. Search Query filter
      const query = searchQuery.toLowerCase();
      const nameMatch = doc.name?.toLowerCase().includes(query);
      const qualMatch = doc.qualification?.toLowerCase().includes(query) || false;
      const codeMatch = doc.employee_code?.toLowerCase().includes(query) || false;
      const searchMatch = nameMatch || qualMatch || codeMatch;

      // 2. Status filter
      const isDocActive = doc.status === 'active' || doc.is_active;
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isDocActive) ||
        (statusFilter === 'inactive' && !isDocActive);

      // 3. Specialty filter
      const specialtyMatch = selectedSpecialty === 'All' || doc.specialty === selectedSpecialty;

      // 4. Center filter
      const centerMatch = selectedCenterId === 'all' || doc.center_id === selectedCenterId;

      return searchMatch && statusMatch && specialtyMatch && centerMatch;
    });
  }, [doctors, searchQuery, statusFilter, selectedSpecialty, selectedCenterId]);

  const renderItem = ({ item }: { item: Doctor }) => (
    <DoctorCard
      doctor={item}
      onEdit={() => navigation.navigate('EditDoctor', { doctorId: item.id })}
      onToggleStatus={() => handleToggleStatus(item)}
      onDelete={() => handleDelete(item)}
    />
  );

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <ChevronLeft size={24} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl }]}>
            Doctors Directory
          </Text>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
          <Search size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
          <TextInput
            placeholder="Search by name, qualification, or code..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.text, fontSize: typography.sizes.sm }]}
          />
        </View>

        {/* Horizontal Filters */}
        <View style={styles.filtersWrapper}>
          {/* Status Tabs */}
          <View style={[styles.statusTabs, { backgroundColor: colors.border + '30', borderRadius: radius.md }]}>
            {(['all', 'active', 'inactive'] as const).map(status => {
              const isActiveTab = statusFilter === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  style={[
                    styles.statusTabButton,
                    isActiveTab && { backgroundColor: colors.surface, borderRadius: radius.sm },
                  ]}
                >
                  <Text style={[
                    styles.statusTabText,
                    { color: isActiveTab ? colors.primary : colors.textSecondary, fontSize: typography.sizes.xs },
                    isActiveTab && { fontWeight: '700' }
                  ]}>
                    {status.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Specialty & Clinic Quick Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {/* Specialty Picker */}
            <Text style={[styles.filterLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>Specialty:</Text>
            {specialties.map((spec: string) => {
              const isSelected = selectedSpecialty === spec;
              return (
                <Pressable
                  key={spec}
                  onPress={() => setSelectedSpecialty(spec)}
                  style={[
                    styles.chipButton,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderRadius: radius.full
                    }
                  ]}
                >
                  <Text style={[styles.chipText, { color: isSelected ? '#FFF' : colors.text, fontSize: typography.sizes.xs }]}>
                    {spec}
                  </Text>
                </Pressable>
              );
            })}

            {/* Clinic Center Picker */}
            <View style={{ width: 12 }} />
            <Text style={[styles.filterLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>Clinic:</Text>
            {centersList.map((center: { id: string; name: string }) => {
              const isSelected = selectedCenterId === center.id;
              return (
                <Pressable
                  key={center.id}
                  onPress={() => setSelectedCenterId(center.id)}
                  style={[
                    styles.chipButton,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderRadius: radius.full
                    }
                  ]}
                >
                  <Text style={[styles.chipText, { color: isSelected ? '#FFF' : colors.text, fontSize: typography.sizes.xs }]}>
                    {center.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text
            style={[styles.resultsCount, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}
          >
            Showing {filteredDoctors.length} of {doctors.length} doctors
          </Text>
        </View>

        {/* Doctor List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textSecondary, marginTop: spacing.md, fontSize: typography.sizes.sm }}>
              Loading doctors database...
            </Text>
          </View>
        ) : error ? (
          <View style={{ flex: 1, padding: spacing.md }}>
            <ErrorState
              title="Failed to Load Directory"
              message={error}
              buttonTitle="Retry Fetch"
              onRetry={() => fetchDoctors()}
            />
          </View>
        ) : filteredDoctors.length === 0 ? (
          <View style={{ flex: 1, padding: spacing.md }}>
            <EmptyState
              title="No Doctors Found"
              subtitle="Try altering your search or filters."
              Icon={Stethoscope}
            />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              data={filteredDoctors}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={[styles.listContent, { paddingBottom: 16 }]}
              refreshing={refreshing}
              onRefresh={() => fetchDoctors(true)}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}

        {/* Floating Action Button */}
        <MedicalFAB
          onPress={() => navigation.navigate('AddDoctor')}
          style={styles.fab}
        />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(4),
    marginTop: hp(1.5),
    marginBottom: hp(2),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
    marginLeft: 4,
  },
  title: {
    fontWeight: '800',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginHorizontal: wp(4),
    marginBottom: 12,
    height: 48,
    borderWidth: 1.2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontWeight: '600',
  },
  filtersWrapper: {
    paddingHorizontal: wp(4),
    marginBottom: 16,
  },
  statusTabs: {
    flexDirection: 'row',
    padding: 3,
    marginBottom: 12,
  },
  statusTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTabText: {
    fontWeight: '600',
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  filterLabel: {
    fontWeight: '700',
    marginRight: 8,
  },
  resultsCount: {
    marginTop: 8,
    fontWeight: '600',
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: wp(4),
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
  },
});

export default ManageDoctorsScreen;
