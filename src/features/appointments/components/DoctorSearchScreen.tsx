import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Search, SlidersHorizontal, Stethoscope } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import DoctorCard from '../../../components/DoctorCard';
import EmptyState from '../../../components/ui/EmptyState';
import { useTheme } from '../../../hooks/useTheme';
import { doctorService } from '../../../services/doctorService';
import type { AppStackParamList } from '../../../navigation/types';
import { supabase } from '../../../lib/supabase';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'DoctorSearch'>;

const DoctorSearchScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, any>>({});

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const data = await doctorService.getAllDoctors();
      setDoctors(data || []);

      // Fetch batch availability for all loaded doctors
      if (data && data.length > 0) {
        const { data: availData, error } = await supabase.rpc('get_doctors_availability_batch', {
          p_doctor_ids: data.map((d: any) => d.id),
        });
        if (!error && availData) {
          const mapping: Record<string, any> = {};
          availData.forEach((item: any) => {
            mapping[item.doctor_id] = item;
          });
          setAvailabilityMap(mapping);
        }
      }
    } catch (err) {
      console.warn('[DoctorSearch] Error loading doctors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  // Extract unique specialties from doctors
  const specialties = useMemo(() => {
    const list = ['All'];
    doctors.forEach(doc => {
      if (doc.specialty && !list.includes(doc.specialty)) {
        list.push(doc.specialty);
      }
    });
    return list;
  }, [doctors]);

  // Filtered doctors list
  const filteredDoctors = useMemo(() => {
    return doctors.filter(doc => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (doc.specialty && doc.specialty.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSpecialty = selectedSpecialty === 'All' || doc.specialty === selectedSpecialty;
      return matchesSearch && matchesSpecialty && doc.is_active;
    });
  }, [doctors, searchQuery, selectedSpecialty]);

  const handleSelectDoctor = (doctorId: string) => {
    // Navigate to public doctor profile
    navigation.navigate('PublicDoctorProfile', { doctorId });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <View style={[styles.titleSection, { paddingHorizontal: spacing.md, marginBottom: spacing.md }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800' }]}>
          Find Doctors
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
          Search and book appointments with certified specialists
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { marginHorizontal: spacing.md, marginBottom: spacing.md }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg }]}>
          <Search size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
          <TextInput
            placeholder="Search by doctor name or specialty..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.input, { color: colors.text, fontSize: typography.sizes.sm }]}
          />
        </View>
      </View>

      {/* Specialties Chips */}
      <View style={{ marginBottom: spacing.md }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={specialties}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
          renderItem={({ item }) => {
            const isSelected = selectedSpecialty === item;
            return (
              <Pressable
                onPress={() => setSelectedSpecialty(item)}
                style={[
                  styles.chip,
                  {
                    borderRadius: radius.full,
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isSelected ? '#FFFFFF' : colors.textSecondary,
                      fontSize: typography.sizes.xs,
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredDoctors.length === 0 ? (
        <View style={{ flex: 1, padding: spacing.xl }}>
          <EmptyState
            title="No Doctors Found"
            subtitle="Try adjusting your search query or choosing another specialty filter."
          />
        </View>
      ) : (
        <FlatList
          data={filteredDoctors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <DoctorCard
              doctor={item}
              availability={availabilityMap[item.id]}
              onPress={() => handleSelectDoctor(item.id)}
            />
          )}
        />
      )}
    </ScreenWrapper>
  );
};

export default DoctorSearchScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
  },
  titleSection: {
    gap: 2,
  },
  title: {},
  subtitle: {},
  searchContainer: {
    flexDirection: 'row',
  },
  searchBar: {
    flex: 1,
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
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.2,
  },
  chipText: {
    textTransform: 'capitalize',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
