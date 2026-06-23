import React, { useCallback } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useDashboardStats } from "../hooks/useDashboardStats";
import {
  CheckCircle,
  Clock,
  MapPinCheck,
  Users,
  XCircle,
} from "lucide-react-native";
import { useAuthStore } from "../../../store/authStore";
import { useProfileStore } from "../../../store/profileStore";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import ProfileAvatar from "../../../components/ui/ProfileAvatar";

const HomeScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats();
  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const isProfileLoading = useProfileStore(state => state.isLoading);

  const refreshHome = useCallback(async () => {
    await Promise.all([
      refetch(),
      user?.id ? fetchProfile(user.id) : Promise.resolve(),
    ]);
  }, [fetchProfile, refetch, user?.id]);

  const StatCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
    <Card style={[styles.statCard, { marginBottom: spacing.md }]}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Icon color={color} size={scaleFont(24)} />
      </View>
      <Text style={[styles.statValue, { color: colors.text, fontSize: typography.sizes.xl }]}>
        {isLoading ? <Skeleton width={wp(11)} height={hp(3.4)} /> : value}
      </Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
        {title}
      </Text>
    </Card>
  );

  return (
    <ScreenWrapper scrollable onRefresh={refreshHome} refreshing={isRefetching || isProfileLoading}>
      <View style={[styles.header, { marginBottom: spacing.xl }]}>
        <View style={styles.headerText}>
          <Text style={[styles.welcomeText, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
            Welcome back,
          </Text>
          <Text style={[styles.nameText, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold }]}>
            {profile?.full_name || 'User'}
          </Text>
        </View>
        <ProfileAvatar uri={profile?.avatar_url} size={56} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md }]}>
        Overview
      </Text>

      <View style={styles.statsRow}>
        <StatCard title="Active" value={stats?.active || 0} icon={Users} color={colors.primary} />
        <StatCard title="Avg Wait" value={`${stats?.avgWait || 0}m`} icon={Clock} color={colors.warning} />
      </View>
      <View style={styles.statsRow}>
        <StatCard title="Completed" value={stats?.completed || 0} icon={CheckCircle} color={colors.success} />
        <StatCard title="Cancelled" value={stats?.cancelled || 0} icon={XCircle} color={colors.error} />
      </View>

      <View style={{ marginTop: spacing.xl }}>
         <Card variant="outlined" style={{ padding: spacing.lg }}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.sm }}>
               Active Queue
            </Text>
            {isLoading ? (
               <View style={{ gap: spacing.sm }}>
                  <Skeleton height={24} width="80%" />
                  <Skeleton height={24} width="50%" />
               </View>
            ) : stats?.active && stats.active > 0 ? (
               <View style={styles.queueStatusRow}>
                  {stats.queueStatus === 'Arrived at Clinic' && (
                    <MapPinCheck
                      color={colors.success}
                      size={scaleFont(20)}
                    />
                  )}
                  <View style={styles.queueStatusText}>
                    <Text style={{ color: colors.textSecondary }}>
                      Status:
                    </Text>
                    <Text
                      style={{
                        color:
                          stats.queueStatus === 'Arrived at Clinic'
                            ? colors.success
                            : colors.text,
                        fontSize: typography.sizes.md,
                        fontWeight: '700',
                      }}
                    >
                      {stats.queueStatus ?? 'Waiting'}
                    </Text>
                  </View>
               </View>
            ) : (
               <Text style={{ color: colors.textSecondary }}>No active appointments right now.</Text>
            )}
         </Card>
      </View>
    </ScreenWrapper>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: wp(3),
  },
  welcomeText: {
    marginBottom: hp(0.5),
  },
  nameText: {
    marginBottom: hp(1.2),
  },
  sectionTitle: {
    fontWeight: '600',
  },
  queueStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: scaleFont(10),
  },
  queueStatusText: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: wp(2.4),
  },
  statCard: {
    flex: 1,
  },
  iconContainer: {
    width: wp(12),
    maxWidth: scaleFont(52),
    minWidth: scaleFont(42),
    aspectRatio: 1,
    borderRadius: scaleFont(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(1.4),
  },
  statValue: {
    fontWeight: '700',
    marginBottom: hp(0.5),
  },
  statTitle: {
    fontWeight: '500',
  }
});
