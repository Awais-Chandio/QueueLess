import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from './ui/Skeleton';
import { useTheme } from '../hooks/useTheme';

export const NearbyClinicSkeleton = () => {
  const { colors, spacing, radius } = useTheme();

  return (
    <ScrollView 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              padding: spacing.md,
              marginBottom: spacing.md,
              borderColor: colors.border + '50',
              borderWidth: 1,
            },
          ]}
        >
          {/* Top Row: Logo & Basic Info */}
          <View style={styles.topRow}>
            {/* Logo Placeholder */}
            <Skeleton
              width={64}
              height={64}
              borderRadius={radius.lg}
              style={{ marginRight: spacing.md }}
            />
            {/* Title & Badge Placeholders */}
            <View style={{ flex: 1, justifyContent: 'space-between', height: 60 }}>
              <View style={styles.inlineRow}>
                <Skeleton width="60%" height={18} borderRadius={radius.sm} />
                <Skeleton width="20%" height={16} borderRadius={radius.sm} />
              </View>
              <Skeleton width="40%" height={12} borderRadius={radius.sm} />
              <View style={styles.inlineRow}>
                <Skeleton width="30%" height={12} borderRadius={radius.sm} />
                <Skeleton width="25%" height={12} borderRadius={radius.sm} />
              </View>
            </View>
          </View>

          {/* Separator */}
          <View style={[styles.separator, { backgroundColor: colors.border + '30', marginVertical: spacing.md }]} />

          {/* Stats Row */}
          <View style={styles.statsRow}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={styles.statCol}>
                <Skeleton width="45%" height={12} borderRadius={radius.sm} style={{ alignSelf: 'center', marginBottom: spacing.xs }} />
                <Skeleton width="65%" height={16} borderRadius={radius.sm} style={{ alignSelf: 'center' }} />
              </View>
            ))}
          </View>

          {/* Action Button Placeholder */}
          <Skeleton
            width="100%"
            height={44}
            borderRadius={radius.borderRadius}
            style={{ marginTop: spacing.md }}
          />
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  skeletonCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  separator: {
    height: 1,
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
});

export default NearbyClinicSkeleton;
