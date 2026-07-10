import React from 'react';
import { View, StyleSheet, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import { Stethoscope, Calendar, Clock } from 'lucide-react-native';
import Card from './ui/Card';
import { useTheme } from '../hooks/useTheme';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import AvailabilityBadge from './AvailabilityBadge';
import type { Doctor } from '../types/doctor';
import { scaleFont } from '../utils/responsive';

interface DoctorCardProps {
  doctor: Doctor;
  onPress: () => void;
}

export const DoctorCard: React.FC<DoctorCardProps> = ({ doctor, onPress }) => {
  const { colors, spacing, typography, radius } = useTheme();
  const { data: availability, isLoading } = useDoctorAvailability(doctor.id);

  const displaySpecialty = doctor.specialty || 'General Specialist';
  const displayExp = doctor.experience_years ? `${doctor.experience_years} years experience` : 'General Experience';
  const displayQual = doctor.qualification || '';

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      containerStyle={styles.container}
    >
      <View style={styles.content}>
        {doctor.photo_url ? (
          <Image source={{ uri: doctor.photo_url }} style={[styles.avatar, { borderRadius: radius.md }]} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight, borderRadius: radius.md }]}>
            <Stethoscope size={scaleFont(24)} color={colors.primary} />
          </View>
        )}

        <View style={styles.infoGroup}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
                {doctor.name}
              </Text>
              {displayQual ? (
                <Text style={[styles.qualification, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  {displayQual}
                </Text>
              ) : null}
            </View>
            
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : availability ? (
              <AvailabilityBadge status={availability.status} />
            ) : null}
          </View>

          <Text style={[styles.specialty, { color: colors.primary, fontSize: typography.sizes.sm }]}>
            {displaySpecialty}
          </Text>

          <Text style={[styles.experience, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {displayExp}
          </Text>

          {availability && (availability.status === 'available' || availability.status === 'busy') && (
            <View style={[styles.queueInfoRow, { marginTop: spacing.xs }]}>
              <View style={styles.metaBadge}>
                <Calendar size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  {availability.tokens_ahead} ahead
                </Text>
              </View>
              <View style={styles.metaBadge}>
                <Clock size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  ~{availability.estimated_wait_minutes} mins wait
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  avatar: {
    width: 68,
    height: 68,
  },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGroup: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontWeight: '800',
  },
  qualification: {
    fontWeight: '600',
  },
  specialty: {
    fontWeight: '700',
    marginTop: 2,
  },
  experience: {
    fontWeight: '600',
  },
  queueInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaText: {
    fontWeight: '700',
  },
});

export default DoctorCard;
