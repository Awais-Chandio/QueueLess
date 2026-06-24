import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useDashboardStats } from '../hooks/useDashboardStats';
import {
  CheckCircle,
  Clock,
  BellRing,
  CircleDot,
  MapPinCheck,
  Users,
  XCircle,
} from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useProfileStore } from '../../../store/profileStore';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import ProfileAvatar from '../../../components/ui/ProfileAvatar';
import { formatWaitDuration } from '../../appointments/utils/appointmentTime';
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue';

const HomeScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats();
  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const isProfileLoading = useProfileStore(state => state.isLoading);
  const activeAppointment = stats?.activeAppointment;
  const activeToken =
    typeof activeAppointment?.tokenNumber === 'number'
      ? activeAppointment.tokenNumber
      : null;

  const {
    queueData,
    loading: queueLoading,
    error: queueError,
  } = useRealtimeQueue(
    activeToken,
    refetch,
    {
      centerId: activeAppointment?.centerId,
      scheduledAt: activeAppointment?.scheduledAt,
    },
    true,
  );

  const queuePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(queuePulse, {
        toValue: 1.02,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(queuePulse, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    queuePulse,
    queueData?.currentToken,
    queueData?.peopleAhead,
    activeAppointment?.status,
  ]);

  const refreshHome = useCallback(async () => {
    await Promise.all([
      refetch(),
      user?.id ? fetchProfile(user.id) : Promise.resolve(),
    ]);
  }, [fetchProfile, refetch, user?.id]);

  const queueStatusText = useMemo(() => {
    if (!activeAppointment) {
      return 'No active queue';
    }

    if (activeAppointment.status === 'called') {
      return 'Called';
    }

    if (
      queueData &&
      activeToken != null &&
      queueData.currentToken >= activeToken
    ) {
      return 'Your turn';
    }

    if (activeAppointment.status === 'confirmed') {
      return 'Waiting';
    }

    if (activeAppointment.status === 'pending') {
      return 'Pending confirmation';
    }

    return stats?.queueStatus ?? 'Waiting';
  }, [activeAppointment, activeToken, queueData, stats?.queueStatus]);

  const progressValue = useMemo(() => {
    if (!queueData || !activeToken || activeToken <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, queueData.currentToken / activeToken));
  }, [activeToken, queueData]);

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
  }: {
    title: string;
    value: string | number;
    icon: any;
    color: string;
  }) => (
    <Card style={[styles.statCard, { marginBottom: spacing.md }]}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Icon color={color} size={scaleFont(24)} />
      </View>
      <Text
        style={[
          styles.statValue,
          { color: colors.text, fontSize: typography.sizes.xl },
        ]}
      >
        {isLoading ? <Skeleton width={wp(11)} height={hp(3.4)} /> : value}
      </Text>
      <Text
        style={[
          styles.statTitle,
          { color: colors.textSecondary, fontSize: typography.sizes.sm },
        ]}
      >
        {title}
      </Text>
    </Card>
  );

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshHome}
      refreshing={isRefetching || isProfileLoading}
    >
      <View style={[styles.header, { marginBottom: spacing.xl }]}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.welcomeText,
              { color: colors.textSecondary, fontSize: typography.sizes.md },
            ]}
          >
            Welcome back,
          </Text>
          <Text
            style={[
              styles.nameText,
              {
                color: colors.text,
                fontSize: typography.sizes.xxl,
                fontWeight: typography.weights.bold,
              },
            ]}
          >
            {profile?.full_name || 'User'}
          </Text>
        </View>
        <ProfileAvatar uri={profile?.avatar_url} size={56} />
      </View>

      <Text
        style={[
          styles.sectionTitle,
          {
            color: colors.text,
            fontSize: typography.sizes.lg,
            marginBottom: spacing.md,
          },
        ]}
      >
        Overview
      </Text>

      <View style={styles.statsRow}>
        <StatCard
          title="Active"
          value={stats?.active || 0}
          icon={Users}
          color={colors.primary}
        />
        <StatCard
          title="Avg Wait"
          value={stats?.avgWait ? formatWaitDuration(stats.avgWait) : '0 min'}
          icon={Clock}
          color={colors.warning}
        />
      </View>
      <View style={styles.statsRow}>
        <StatCard
          title="Completed"
          value={stats?.completed || 0}
          icon={CheckCircle}
          color={colors.success}
        />
        <StatCard
          title="Cancelled"
          value={stats?.cancelled || 0}
          icon={XCircle}
          color={colors.error}
        />
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Animated.View style={{ transform: [{ scale: queuePulse }] }}>
          <Card variant="outlined" style={{ padding: spacing.lg }}>
            <View style={styles.queueHeader}>
              <View>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typography.sizes.lg,
                    fontWeight: '700',
                  }}
                >
                  Queue Status
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    marginTop: hp(0.4),
                  }}
                >
                  Live token updates
                </Text>
              </View>
              <View
                style={[
                  styles.liveBadge,
                  { backgroundColor: `${colors.success}18` },
                ]}
              >
                <CircleDot color={colors.success} size={scaleFont(14)} />
                <Text
                  style={{
                    color: colors.success,
                    fontSize: typography.sizes.xs,
                    fontWeight: '700',
                  }}
                >
                  Live
                </Text>
              </View>
            </View>

            {isLoading || queueLoading ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Skeleton height={24} width="80%" />
                <Skeleton height={24} width="50%" />
                <Skeleton height={10} width="100%" />
              </View>
            ) : activeAppointment && activeToken != null ? (
              <View style={{ marginTop: spacing.md }}>
                <View style={styles.queueMetricsGrid}>
                  <View
                    style={[
                      styles.queueMetric,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricLabel,
                        {
                          color: colors.textSecondary,
                          fontSize: typography.sizes.xs,
                        },
                      ]}
                    >
                      Current Token
                    </Text>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color: colors.primaryDark,
                          fontSize: typography.sizes.xl,
                        },
                      ]}
                    >
                      #{queueData?.currentToken ?? 0}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.queueMetric,
                      { backgroundColor: `${colors.info}18` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricLabel,
                        {
                          color: colors.textSecondary,
                          fontSize: typography.sizes.xs,
                        },
                      ]}
                    >
                      Your Token
                    </Text>
                    <Text
                      style={[
                        styles.metricValue,
                        { color: colors.info, fontSize: typography.sizes.xl },
                      ]}
                    >
                      #{activeToken}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.queueMetric,
                      { backgroundColor: `${colors.warning}18` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricLabel,
                        {
                          color: colors.textSecondary,
                          fontSize: typography.sizes.xs,
                        },
                      ]}
                    >
                      People Ahead
                    </Text>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color: colors.warning,
                          fontSize: typography.sizes.xl,
                        },
                      ]}
                    >
                      {queueData?.peopleAhead ?? 0}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.queueMetric,
                      { backgroundColor: `${colors.success}18` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricLabel,
                        {
                          color: colors.textSecondary,
                          fontSize: typography.sizes.xs,
                        },
                      ]}
                    >
                      Estimated Wait
                    </Text>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color: colors.success,
                          fontSize: typography.sizes.xl,
                        },
                      ]}
                    >
                      {formatWaitDuration(queueData?.estimatedWaitMins ?? 0)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[styles.queueStatusRow, { marginTop: spacing.md }]}
                >
                  {queueStatusText === 'Called' ||
                  queueStatusText === 'Your turn' ? (
                    <BellRing color={colors.info} size={scaleFont(20)} />
                  ) : stats?.queueStatus === 'Arrived at Clinic' ? (
                    <MapPinCheck color={colors.success} size={scaleFont(20)} />
                  ) : (
                    <Clock color={colors.primary} size={scaleFont(20)} />
                  )}
                  <View style={styles.queueStatusText}>
                    <Text style={{ color: colors.textSecondary }}>
                      Queue Status
                    </Text>
                    <Text
                      style={{
                        color:
                          queueStatusText === 'Called' ||
                          queueStatusText === 'Your turn'
                            ? colors.info
                            : colors.text,
                        fontSize: typography.sizes.md,
                        fontWeight: '700',
                      }}
                    >
                      {queueStatusText}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: spacing.md }}>
                  <ProgressBar
                    progress={progressValue}
                    color={colors.primary}
                    trackColor={colors.border}
                  />
                </View>

                {queueError && (
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: typography.sizes.sm,
                      marginTop: spacing.sm,
                    }}
                  >
                    {queueError}
                  </Text>
                )}
              </View>
            ) : (
              <Text
                style={{ color: colors.textSecondary, marginTop: spacing.md }}
              >
                No active appointments right now.
              </Text>
            )}
          </Card>
        </Animated.View>
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
  liveBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: wp(1.2),
    paddingHorizontal: wp(2.4),
    paddingVertical: hp(0.6),
  },
  metricLabel: {
    fontWeight: '600',
  },
  metricValue: {
    fontWeight: '800',
    marginTop: hp(0.6),
  },
  queueHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  queueMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(2.4),
  },
  queueMetric: {
    borderRadius: 12,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: hp(9),
    paddingHorizontal: wp(3),
    paddingVertical: hp(1.2),
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
  },
});
