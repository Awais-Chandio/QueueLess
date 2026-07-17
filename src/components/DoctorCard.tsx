import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { Stethoscope, Calendar, Clock, Award, Star, MapPin } from 'lucide-react-native';
import Card from './ui/Card';
import AppButton from './ui/AppButton';
import { useTheme } from '../hooks/useTheme';
import AvailabilityBadge from './AvailabilityBadge';
import type { Doctor, DoctorAvailability } from '../types/doctor';
import { scaleFont, wp } from '../utils/responsive';
import { getDoctorMockData } from '../utils/doctorMockHelper';

interface DoctorCardProps {
  doctor: Doctor;
  availability?: DoctorAvailability | null;
  onPress: () => void;
}

export const DoctorCard: React.FC<DoctorCardProps> = ({ doctor, availability, onPress }) => {
  const { colors, spacing, typography, radius, isDarkMode } = useTheme();
  
  const mockData = getDoctorMockData(doctor.id);

  const displaySpecialty = doctor.specialty || 'General Specialist';
  const displayExp = doctor.experience_years ? `${doctor.experience_years} Years Experience` : 'General Experience';
  const displayQual = doctor.qualification || 'MBBS';
  const feeLabel = doctor.fee != null ? `Rs. ${doctor.fee}` : 'Fee Rs. 1500';
  const clinicName = doctor.service_centers?.name || 'Main Medical Center';

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      containerStyle={styles.container}
      style={[
        styles.innerCard,
        {
          backgroundColor: colors.surface,
          borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          borderWidth: 1,
        }
      ]}
    >
      <View style={styles.content}>
        {/* Left Side: Avatar & Availability Badges */}
        <View style={styles.avatarContainer}>
          {doctor.photo_url ? (
            <Image source={{ uri: doctor.photo_url }} style={[styles.avatar, { borderRadius: radius.md }]} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.md }]}>
              <Stethoscope size={scaleFont(28)} color={colors.primary} />
            </View>
          )}
          
          <View style={styles.badgeWrapper}>
            {availability ? (
              <AvailabilityBadge status={availability.status} />
            ) : (
              <AvailabilityBadge status="available" />
            )}
          </View>
        </View>

        {/* Right Side: Doctor Metadata */}
        <View style={styles.infoGroup}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]} numberOfLines={1}>
              {doctor.name}
            </Text>
          </View>

          <Text style={[styles.specialty, { color: colors.primary, fontSize: typography.sizes.xs }]} numberOfLines={1}>
            {displaySpecialty} • <Text style={{ color: colors.textSecondary }}>{displayQual}</Text>
          </Text>

          {/* Rating & Experience */}
          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Star size={12} color="#FBBF24" fill="#FBBF24" style={{ marginRight: 3 }} />
              <Text style={[styles.ratingText, { color: colors.text, fontSize: typography.sizes.xs }]}>
                {mockData.rating} <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>({mockData.reviewsCount})</Text>
              </Text>
            </View>
            <View style={[styles.bullet, { backgroundColor: colors.textSecondary + '40' }]} />
            <View style={styles.expBadge}>
              <Award size={12} color={colors.textSecondary} style={{ marginRight: 3 }} />
              <Text style={[styles.expText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                {displayExp}
              </Text>
            </View>
          </View>

          {/* Clinic Name */}
          <View style={styles.clinicRow}>
            <MapPin size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={[styles.clinicText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]} numberOfLines={1}>
              {clinicName}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />

          {/* Bottom Card Row: Fee & Next Available Slot */}
          <View style={styles.footerRow}>
            <Text style={[styles.feeText, { color: colors.text, fontSize: typography.sizes.xs }]}>
              {feeLabel}
            </Text>
            <View style={[styles.slotBadge, { backgroundColor: colors.primary + '10', borderRadius: radius.sm }]}>
              <Calendar size={11} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.slotText, { color: colors.primary, fontSize: typography.sizes.xs - 1 }]}>
                Next Slot: {mockData.nextSlot}
              </Text>
            </View>
          </View>

          <View style={{ height: spacing.sm }} />

          <AppButton
            title="View Profile"
            onPress={onPress}
            style={{ paddingVertical: 6, minHeight: 32 }}
            textStyle={{ fontSize: 12 }}
          />
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  innerCard: {
    padding: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarContainer: {
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 76,
    height: 76,
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrapper: {
    marginTop: 2,
  },
  infoGroup: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  specialty: {
    fontWeight: '800',
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontWeight: '800',
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 8,
  },
  expBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expText: {
    fontWeight: '700',
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  clinicText: {
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeText: {
    fontWeight: '800',
  },
  slotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  slotText: {
    fontWeight: '800',
  },
});

export default DoctorCard;
