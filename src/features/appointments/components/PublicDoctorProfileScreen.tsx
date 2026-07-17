import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Star, MapPin, Award, Stethoscope, DollarSign, Calendar, MessageSquare } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { doctorService } from '../../../services/doctorService';
import { getDoctorMockData } from '../../../utils/doctorMockHelper';
import type { AppStackParamList } from '../../../navigation/types';

type PublicDoctorProfileRouteProp = RouteProp<AppStackParamList, 'PublicDoctorProfile'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'PublicDoctorProfile'>;

const PublicDoctorProfileScreen = () => {
  const route = useRoute<PublicDoctorProfileRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius, isDarkMode } = useTheme();

  const { doctorId, centerId: routeCenterId, serviceId: routeServiceId } = route.params;

  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mockData = getDoctorMockData(doctorId);

  useEffect(() => {
    const loadDoctorDetails = async () => {
      try {
        setLoading(true);
        const data = await doctorService.getDoctorById(doctorId);
        setDoctor(data);
      } catch (err) {
        console.warn('[PublicDoctorProfile] Error loading doctor:', err);
        Alert.alert('Error', 'Failed to load doctor profile.');
      } finally {
        setLoading(false);
      }
    };
    loadDoctorDetails();
  }, [doctorId]);

  const handleBook = () => {
    if (!doctor) return;

    const finalCenterId = routeCenterId || doctor.center_id;
    const finalServiceId = routeServiceId;

    if (finalCenterId && finalServiceId) {
      // Direct booking since both are resolved
      navigation.navigate('SelectSlot', {
        doctorId: doctor.id,
        centerId: finalCenterId,
        serviceId: finalServiceId,
      });
    } else {
      // Doctor-First Flow: Resolve service center and department
      const services = doctor.doctor_services || [];
      if (services.length === 1) {
        // Pre-select single service
        navigation.navigate('SelectSlot', {
          doctorId: doctor.id,
          centerId: finalCenterId,
          serviceId: services[0].service_id,
        });
      } else {
        // Multiple services: Let the user select the clinic department service
        navigation.navigate('ClinicSelection', { doctorId: doctor.id });
      }
    }
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
  const specialtyLabel = doctor.specialty || 'General Specialist';
  const qualLabel = doctor.qualification || 'MBBS';
  const experienceLabel = doctor.experience_years ? `${doctor.experience_years} Years Experience` : 'General Experience';
  const feeLabel = doctor.fee != null ? `Rs. ${doctor.fee}` : 'Rs. 1500';

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileHeader}>
          {doctor.photo_url ? (
            <Image source={{ uri: doctor.photo_url }} style={[styles.avatar, { borderRadius: radius.xl }]} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.xl }]}>
              <Stethoscope size={64} color={colors.primary} />
            </View>
          )}

          <Text style={[styles.docName, { color: colors.text, fontSize: typography.sizes.lg }]}>
            {doctor.name}
          </Text>
          <Text style={[styles.docSpecialty, { color: colors.primary, fontSize: typography.sizes.sm }]}>
            {specialtyLabel}
          </Text>
          <Text style={[styles.docQual, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {qualLabel}
          </Text>

          {/* Rating Summary */}
          <View style={styles.ratingRow}>
            <View style={styles.starsWrapper}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  color={i < Math.floor(mockData.rating) ? '#FBBF24' : '#E5E7EB'}
                  fill={i < Math.floor(mockData.rating) ? '#FBBF24' : 'transparent'}
                  style={{ marginRight: 2 }}
                />
              ))}
            </View>
            <Text style={[styles.ratingVal, { color: colors.text }]}>
              {mockData.rating} <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>({mockData.reviewsCount} reviews)</Text>
            </Text>
          </View>
        </View>

        {/* Doctor Badges */}
        <View style={[styles.badgesRow, { gap: spacing.md }]}>
          <View style={[styles.badgeCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md }]}>
            <Award size={18} color={colors.primary} style={{ marginBottom: 4 }} />
            <Text style={[styles.badgeTitle, { color: colors.textSecondary }]}>Experience</Text>
            <Text style={[styles.badgeVal, { color: colors.text }]}>{experienceLabel}</Text>
          </View>

          <View style={[styles.badgeCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md }]}>
            <DollarSign size={18} color={colors.primary} style={{ marginBottom: 4 }} />
            <Text style={[styles.badgeTitle, { color: colors.textSecondary }]}>Consultation Fee</Text>
            <Text style={[styles.badgeVal, { color: colors.text }]}>{feeLabel}</Text>
          </View>
        </View>

        {/* Biography */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
            About Doctor
          </Text>
          <Text style={[styles.bioText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            {doctor.bio || `Dr. ${doctor.name} is a renowned ${specialtyLabel} with deep clinical expertise. Committed to offering modern, queue-managed patient consultations at ${clinicName}.`}
          </Text>
        </View>

        {/* Languages Spoken */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
            Languages Spoken
          </Text>
          <Text style={[styles.bioText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            English, Urdu, Punjabi
          </Text>
        </View>

        {/* Available Schedule */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
            Available Schedule
          </Text>
          <Text style={[styles.bioText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Monday - Friday: 09:00 AM - 05:00 PM
          </Text>
        </View>

        {/* Clinic Location */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
            Clinic Location
          </Text>
          <Card variant="flat" style={[styles.clinicCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md }]}>
            <MapPin size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.clinicCardName, { color: colors.text }]}>{clinicName}</Text>
              <Text style={[styles.clinicCardAddress, { color: colors.textSecondary }]}>{clinicAddress}</Text>
            </View>
          </Card>
        </View>

        {/* Patient Reviews */}
        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <View style={styles.reviewsTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
              Patient Reviews
            </Text>
            <View style={styles.reviewCountBadge}>
              <MessageSquare size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>
                {mockData.reviewsCount}
              </Text>
            </View>
          </View>

          <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
            {mockData.reviews.map((rev) => (
              <View
                key={rev.id}
                style={[
                  styles.reviewItem,
                  {
                    borderBottomColor: colors.border + '50',
                  }
                ]}
              >
                <View style={styles.reviewHeader}>
                  <Text style={[styles.reviewUser, { color: colors.text }]}>{rev.userName}</Text>
                  <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>{rev.date}</Text>
                </View>
                <View style={styles.reviewStars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={10}
                      color={i < rev.rating ? '#FBBF24' : '#E5E7EB'}
                      fill={i < rev.rating ? '#FBBF24' : 'transparent'}
                      style={{ marginRight: 2 }}
                    />
                  ))}
                </View>
                <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>
                  {rev.comment}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Spacer for bottom sticky button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Bottom Booking Button */}
      <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <AppButton
          title="Book Appointment"
          onPress={handleBook}
          variant="primary"
          leftIcon={<Calendar size={18} color="#FFFFFF" />}
        />
      </View>
    </ScreenWrapper>
  );
};

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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginVertical: 16,
  },
  avatar: {
    width: 110,
    height: 110,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  docName: {
    fontWeight: '900',
  },
  docSpecialty: {
    fontWeight: '800',
    marginTop: 2,
  },
  docQual: {
    fontWeight: '600',
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  starsWrapper: {
    flexDirection: 'row',
    marginRight: 6,
  },
  ratingVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  badgeCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
  },
  badgeTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeVal: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  section: {
    width: '100%',
  },
  sectionTitle: {
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  bioText: {
    lineHeight: 20,
    fontWeight: '500',
  },
  clinicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.2,
  },
  clinicCardName: {
    fontSize: 13,
    fontWeight: '800',
  },
  clinicCardAddress: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  reviewsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  reviewItem: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewUser: {
    fontSize: 12,
    fontWeight: '800',
  },
  reviewDate: {
    fontSize: 10,
    fontWeight: '500',
  },
  reviewStars: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  reviewComment: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1.2,
  },
});

export default PublicDoctorProfileScreen;
