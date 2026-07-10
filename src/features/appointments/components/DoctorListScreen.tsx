import React from 'react';
import { View, StyleSheet, Text, FlatList, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Stethoscope } from 'lucide-react-native';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import DoctorCard from '../../../components/DoctorCard';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorsByService } from '../../../hooks/useDoctorsByService';
import type { AppStackParamList } from '../../../navigation/types';

type DoctorListRouteProp = RouteProp<AppStackParamList, 'DoctorList'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'DoctorList'>;

export const DoctorListScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DoctorListRouteProp>();
  const { colors, spacing, typography } = useTheme();

  const { centerId, serviceId, serviceName } = route.params;

  const { data: doctors, isLoading, error, refetch } = useDoctorsByService(centerId, serviceId);

  const handleSelectDoctor = (doctorId: string) => {
    // Navigate to QueueStatus (which acts as the live queue preview screen before booking)
    navigation.navigate('QueueStatus', {
      centerId,
      serviceId,
      doctorId,
    });
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
          onRetry={refetch}
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
        renderItem={({ item }) => (
          <DoctorCard
            doctor={item}
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
