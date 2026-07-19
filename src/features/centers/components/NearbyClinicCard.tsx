import React, { useMemo } from 'react';
import { View, StyleSheet, Text, Image, Pressable } from 'react-native';
import { Hospital, MapPin, Star, Stethoscope, Users, Clock } from 'lucide-react-native';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import AppButton from '../../../components/ui/AppButton';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useTheme } from '../../../hooks/useTheme';
import { NearbyCenter } from '../../../hooks/useNearbyClinics';
import { scaleFont } from '../../../utils/responsive';

interface NearbyClinicCardProps {
  item: NearbyCenter;
  index: number;
  onPressBook: () => void;
}

// Function to check if clinic is open
const isCenterOpen = (openTime: string | null, closeTime: string | null): boolean => {
  if (!openTime || !closeTime) return true;
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);

    const currentVal = currentHour * 60 + currentMin;
    const openVal = openH * 60 + (openM || 0);
    const closeVal = closeH * 60 + (closeM || 0);

    return currentVal >= openVal && currentVal <= closeVal;
  } catch (e) {
    return true;
  }
};

const NearbyClinicCardComponent: React.FC<NearbyClinicCardProps> = ({ item, index, onPressBook }) => {
  const { colors, spacing, radius, typography } = useTheme();

  // Determine if clinic is open
  const isOpen = useMemo(() => isCenterOpen(item.open_time, item.close_time), [item.open_time, item.close_time]);

  // Format distance cleanly
  const formattedDistance = useMemo(() => {
    if (item.distance_km == null) return '';
    const dist = parseFloat(item.distance_km);
    return `${dist.toFixed(1)} km away`;
  }, [item.distance_km]);

  return (
    <CardFadeIn delay={index * 100}>
      <Card
        variant="elevated"
        style={[styles.card, { padding: spacing.md, borderRadius: radius.xl }]}
        containerStyle={{ marginBottom: spacing.md }}
        onPress={onPressBook}
      >
        {/* Top Section: Logo, Name, Distance & Rating */}
        <View style={styles.topSection}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={[styles.logo, { borderRadius: radius.lg }]}
            />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.lg }]}>
              <Hospital size={30} color={colors.primary} />
            </View>
          )}

          <View style={styles.infoSection}>
            {/* Title & Distance */}
            <View style={styles.nameRow}>
              <Text
                style={[styles.clinicName, { color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {formattedDistance ? (
                <Text style={[styles.distanceText, { color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }]}>
                  {formattedDistance}
                </Text>
              ) : null}
            </View>

            {/* Badges & Rating Row */}
            <View style={styles.badgeRow}>
              <View style={styles.ratingContainer}>
                <Star size={14} color="#FBBF24" fill="#FBBF24" style={{ marginRight: 2 }} />
                <Text style={[styles.ratingText, { color: colors.text, fontSize: typography.sizes.xs, fontWeight: '800' }]}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
              
              <Badge
                label={isOpen ? 'Open' : 'Closed'}
                variant={isOpen ? 'success' : 'error'}
                style={{ marginLeft: spacing.sm }}
              />
            </View>

            {/* Address */}
            <View style={styles.metaRow}>
              <MapPin size={12} color={colors.textSecondary} style={{ marginRight: 4, marginTop: 1 }} />
              <Text
                style={[styles.addressText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}
                numberOfLines={1}
              >
                {item.address}, {item.city}
              </Text>
            </View>

            {/* Doctor Count */}
            <View style={styles.metaRow}>
              <Stethoscope size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.doctorText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                {item.doctorCount} Doctor{item.doctorCount !== 1 ? 's' : ''} Active
              </Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border + '30', marginVertical: spacing.md }]} />

        {/* Queue Stats Section */}
        <View style={[styles.queueGrid, { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }]}>
          <View style={styles.queueCol}>
            <Text style={[styles.queueLabel, { color: colors.textSecondary, fontSize: scaleFont(10) }]}>
              Current Token
            </Text>
            <Text style={[styles.queueVal, { color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }]}>
              {item.currentToken}
            </Text>
          </View>

          <View style={[styles.queueDivider, { backgroundColor: colors.border + '50' }]} />

          <View style={styles.queueCol}>
            <Text style={[styles.queueLabel, { color: colors.textSecondary, fontSize: scaleFont(10) }]}>
              Waiting
            </Text>
            <Text style={[styles.queueVal, { color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }]}>
              {item.waitingCount}
            </Text>
          </View>

          <View style={[styles.queueDivider, { backgroundColor: colors.border + '50' }]} />

          <View style={styles.queueCol}>
            <Text style={[styles.queueLabel, { color: colors.textSecondary, fontSize: scaleFont(10) }]}>
              Estimated Wait
            </Text>
            <Text style={[styles.queueVal, { color: colors.primary, fontSize: typography.sizes.md, fontWeight: '800' }]}>
              {item.estimatedWait > 0 ? `${item.estimatedWait} mins` : 'No Wait'}
            </Text>
          </View>
        </View>

        {/* Book Button */}
        <AppButton
          title="Book Appointment"
          onPress={onPressBook}
          variant="primary"
          style={{ marginTop: spacing.md }}
        />
      </Card>
    </CardFadeIn>
  );
};

export const NearbyClinicCard = React.memo(NearbyClinicCardComponent);

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.05)',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 64,
    height: 64,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicName: {
    maxWidth: '65%',
  },
  distanceText: {
    textAlign: 'right',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  addressText: {
    flex: 1,
  },
  doctorText: {
    fontWeight: '500',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  queueGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queueCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  queueVal: {},
  queueDivider: {
    width: 1,
    height: 24,
  },
});
