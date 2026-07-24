import React, {
  memo,
  useCallback,
} from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Clock,
  MapPin,
  Navigation,
  Tag,
} from 'lucide-react-native';

import BottomSheet from '../ui/BottomSheet';
import AppButton from '../ui/AppButton';
import { useTheme } from '../../hooks/useTheme';
import type { NearbyCenter } from '../../services/centers/centerService';
import { openMapNavigation } from '../../services/location/mapNavigationService';
import {
  formatCenterTime,
  formatDistance,
} from '../../utils/centerLocation';

type CenterBottomSheetProps = {
  center: NearbyCenter | null;
  visible: boolean;
  onClose: () => void;
  onViewDetails: (centerId: string) => void;
};

const CenterBottomSheet = ({
  center,
  visible,
  onClose,
  onViewDetails,
}: CenterBottomSheetProps) => {
  const { colors, spacing, radius, typography } = useTheme();

  const handleViewDetails = useCallback(() => {
    if (!center) {
      return;
    }

    onClose();
    onViewDetails(center.id);
  }, [center, onClose, onViewDetails]);

  const handleNavigate = useCallback(async () => {
    if (!center) {
      return;
    }

    try {
      await openMapNavigation(center.latitude, center.longitude);
    } catch {
      Alert.alert(
        'Navigation unavailable',
        'Unable to open a navigation application on this device.',
      );
    }
  }, [center]);

  if (!center) {
    return null;
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={center.name}
      maxHeightPercent={0.72}
    >
      <View
        style={[
          styles.categoryBadge,
          {
            backgroundColor: colors.primaryLight,
            borderRadius: radius.full,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          },
        ]}
      >
        <Tag size={14} color={colors.primary} />
        <Text
          style={[
            styles.categoryText,
            {
              color: colors.primary,
              fontSize: typography.sizes.xs,
              marginLeft: spacing.xs,
            },
          ]}
        >
          {center.category}
        </Text>
      </View>

      <View style={[styles.infoRow, { marginTop: spacing.lg }]}>
        <MapPin size={18} color={colors.primary} />
        <Text
          style={[
            styles.infoText,
            {
              color: colors.textSecondary,
              fontSize: typography.sizes.sm,
              marginLeft: spacing.sm,
            },
          ]}
        >
          {center.address}
        </Text>
      </View>

      <View style={[styles.infoRow, { marginTop: spacing.md }]}>
        <Clock size={18} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text
            style={[
              styles.infoLabel,
              {
                color: colors.textSecondary,
                fontSize: typography.sizes.xs,
              },
            ]}
          >
            Opening hours
          </Text>
          <Text
            style={[
              styles.infoValue,
              {
                color: colors.text,
                fontSize: typography.sizes.sm,
                marginTop: 2,
              },
            ]}
          >
            {formatCenterTime(center.open_time)} –{' '}
            {formatCenterTime(center.close_time)}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.distanceCard,
          {
            backgroundColor: colors.primary + '10',
            borderRadius: radius.lg,
            marginTop: spacing.lg,
            padding: spacing.md,
          },
        ]}
      >
        <Navigation size={18} color={colors.primary} />
        <Text
          style={[
            styles.distanceText,
            {
              color: colors.primary,
              fontSize: typography.sizes.md,
              marginLeft: spacing.sm,
            },
          ]}
        >
          {formatDistance(center.distance)} away
        </Text>
      </View>

      <View style={[styles.buttonRow, { gap: spacing.sm, marginTop: spacing.md }]}>
        <View style={styles.button}>
          <AppButton
            title="View Details"
            variant="outline"
            onPress={handleViewDetails}
          />
        </View>
        <View style={styles.button}>
          <AppButton
            title="Navigate"
            onPress={handleNavigate}
            leftIcon={<Navigation size={17} color="#FFFFFF" />}
          />
        </View>
      </View>
    </BottomSheet>
  );
};

export default memo(CenterBottomSheet);

const styles = StyleSheet.create({
  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryText: {
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    lineHeight: 20,
  },
  infoLabel: {
    fontWeight: '600',
  },
  infoValue: {
    fontWeight: '700',
  },
  distanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceText: {
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
  },
});

