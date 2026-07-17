import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import DoctorCard from '../../../components/DoctorCard';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorsByService } from '../../../hooks/useDoctorsByService';
import type { AppStackParamList } from '../../../navigation/types';
import { supabase } from '../../../lib/supabase';

type DoctorListRouteProp = RouteProp<AppStackParamList, 'DoctorList'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'DoctorList'>;

export const DoctorListScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DoctorListRouteProp>();
  const { colors, spacing, typography } = useTheme();

  const { centerId, serviceId, serviceName } = route.params;

  const { data: doctors, isLoading, error, refetch } = useDoctorsByService(centerId, serviceId);

  const [availabilityMap, setAvailabilityMap] = useState<Record<string, any>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    const fetchBatchAvailability = async () => {
      if (!doctors || doctors.length === 0) return;
      try {
        setAvailabilityLoading(true);
        const doctorIds = doctors.map(d => d.id);
        const { data, error: rpcErr } = await supabase.rpc('get_doctors_availability_batch', {
          p_doctor_ids: doctorIds,
        });

        if (rpcErr) throw rpcErr;

        const mapping: Record<string, any> = {};
        if (data) {
          data.forEach((item: any) => {
            mapping[item.doctor_id] = item;
          });
        }
        setAvailabilityMap(mapping);
      } catch (err) {
        console.warn('[DoctorList] Error fetching batch availability:', err);
      } finally {
        setAvailabilityLoading(false);
      }
    };

    fetchBatchAvailability();
  }, [doctors]);

  const handleSelectDoctor = (doctorId: string) => {
    navigation.navigate('PublicDoctorProfile', {
      centerId,
      serviceId,
      doctorId,
    });
  };

  const handleRefresh = async () => {
    await refetch();
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Loader message="Fetching available doctors..." />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Error Loading Doctors"
          message={error instanceof Error ? error.message : 'Unable to fetch doctors'}
          buttonTitle="Retry"
          onRetry={handleRefresh}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.headerRow}>
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
      </View>

      <View style={[styles.titleSection, { marginBottom: spacing.md }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl }]}>
          Select Doctor
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
          Choose an on-duty specialist for {serviceName || 'General Consultation'}
        </Text>
      </View>

      <FlatList
        data={doctors}
        keyExtractor={item => item.id}
        refreshing={isLoading || availabilityLoading}
        onRefresh={handleRefresh}
        renderItem={({ item }) => (
          <DoctorCard
            doctor={item}
            availability={availabilityMap[item.id] || null}
            onPress={() => handleSelectDoctor(item.id)}
          />
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <EmptyState
            title="No Doctors Available"
            subtitle="There are currently no doctors scheduled for this service."
          />
        }
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '700',
  },
  titleSection: {
    gap: 4,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '600',
  },
});

export default DoctorListScreen;
