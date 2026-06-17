import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { Users, Clock, CheckCircle, XCircle } from "lucide-react-native";
import { useAuthStore } from "../../../store/authStore";
import { hp, scaleFont, wp } from "../../../utils/responsive";

const HomeScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats();
  const user = useAuthStore(state => state.user);

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
    <ScreenWrapper scrollable onRefresh={refetch} refreshing={isRefetching}>
      <View style={{ marginBottom: spacing.xl }}>
        <Text style={[styles.welcomeText, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
          Welcome back,
        </Text>
        <Text style={[styles.nameText, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold }]}>
          {user?.user_metadata?.full_name || 'User'}
        </Text>
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
               <Text style={{ color: colors.textSecondary }}>You have {stats.active} active appointments.</Text>
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
  welcomeText: {
    marginBottom: scaleFont(4),
  },
  nameText: {
    marginBottom: scaleFont(16),
  },
  sectionTitle: {
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: scaleFont(8),
  },
  statCard: {
    flex: 1,
  },
  iconContainer: {
    width: scaleFont(48),
    height: scaleFont(48),
    borderRadius: scaleFont(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scaleFont(12),
  },
  statValue: {
    fontWeight: '700',
    marginBottom: scaleFont(4),
  },
  statTitle: {
    fontWeight: '500',
  }
});
