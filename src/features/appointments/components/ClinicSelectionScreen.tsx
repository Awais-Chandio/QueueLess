import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, MapPin, Stethoscope, ChevronRight } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { doctorService } from '../../../services/doctorService';
import type { AppStackParamList } from '../../../navigation/types';

type ClinicSelectionRouteProp = RouteProp<AppStackParamList, 'ClinicSelection'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'ClinicSelection'>;

const ClinicSelectionScreen = () => {
  const route = useRoute<ClinicSelectionRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const { doctorId } = route.params;
  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDoctorInfo = async () => {
      try {
        setLoading(true);
        const data = await doctorService.getDoctorById(doctorId);
        setDoctor(data);
      } catch (err) {
        console.warn('[ClinicSelection] Error loading doctor:', err);
        Alert.alert('Error', 'Failed to load doctor mapping details.');
      } finally {
        setLoading(false);
      }
    };
    loadDoctorInfo();
  }, [doctorId]);

  const handleSelectService = (serviceId: string) => {
    if (!doctor) return;
    navigation.navigate('SelectSlot', {
      doctorId: doctor.id,
      centerId: doctor.center_id,
      serviceId,
    });
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!doctor) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Doctor details not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  const clinicName = doctor.service_centers?.name || 'Main Medical Center';
  const clinicAddress = doctor.service_centers?.address 
    ? `${doctor.service_centers.address}, ${doctor.service_centers.city}` 
    : 'Karachi, Pakistan';
  const doctorServices = doctor.doctor_services || [];

  return (
    <ScreenWrapper>
      {/* Header */}
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
          Select Department
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
          Select which department/service to book for Dr. {doctor.name}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
        {/* Clinic Location Card */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
          CLINIC LOCATION
        </Text>
        <Card variant="flat" style={[styles.clinicCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
          <MapPin size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.clinicNameText, { color: colors.text }]}>{clinicName}</Text>
            <Text style={[styles.clinicAddressText, { color: colors.textSecondary }]}>{clinicAddress}</Text>
          </View>
        </Card>
      </View>

      {/* Services List */}
      <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
          AVAILABLE DEPARTMENTS / SERVICES
        </Text>

        {doctorServices.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            No departments configured for this doctor.
          </Text>
        ) : (
          <FlatList
            data={doctorServices}
            keyExtractor={(item) => item.service_id}
            renderItem={({ item }) => {
              const serviceName = item.services?.name || 'Consultation';
              return (
                <Pressable
                  onPress={() => handleSelectService(item.service_id)}
                  style={({ pressed }) => [
                    styles.serviceRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      padding: spacing.md,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={styles.serviceRowLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.primary + '10' }]}>
                      <Stethoscope size={18} color={colors.primary} />
                    </View>
                    <Text style={[styles.serviceNameText, { color: colors.text, fontSize: typography.sizes.sm }]}>
                      {serviceName}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>
              );
            }}
            contentContainerStyle={{ gap: 10 }}
          />
        )}
      </View>
    </ScreenWrapper>
  );
};

export default ClinicSelectionScreen;

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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  clinicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.2,
  },
  clinicNameText: {
    fontSize: 13,
    fontWeight: '800',
  },
  clinicAddressText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
  },
  serviceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serviceNameText: {
    fontWeight: '800',
  },
});
