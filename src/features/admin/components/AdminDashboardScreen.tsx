import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { useQuery } from '@tanstack/react-query';
import { BarChart, PieChart } from 'react-native-chart-kit';
import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  XCircle,
  Stethoscope,
  CheckCheck,
  BellRing,
  Zap,
  LogOut,
  UserPlus,
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { analyticsService } from '../api/analyticsService';

const ACTION_META: Record<string, { icon: any; color: string; label: string }> = {
  confirm: { icon: CheckCircle2, color: '#22C55E', label: 'Confirmed' },
  cancel: { icon: XCircle, color: '#EF4444', label: 'Cancelled' },
  call_next: { icon: BellRing, color: '#8B5CF6', label: 'Called' },
  complete_service: { icon: CheckCheck, color: '#22C55E', label: 'Completed' },
};

const AdminDashboardScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();

  const {
    data: analytics,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-analytics-dashboard'],
    queryFn: analyticsService.getDashboardStats,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const horizontalPadding = wp(4);
  const chartWidth = Math.max(
    240,
    Math.floor(width - horizontalPadding * 2 - spacing.md * 2 - wp(8)),
  );
  const chartHeight = Math.max(180, hp(22));

  const totalForProgress = analytics?.totalAppointments || 1;

  const statCards = useMemo(
    () => [
      {
        label: 'Total',
        value: analytics?.totalAppointments ?? 0,
        color: colors.primary,
        icon: ClipboardList,
        progress: 1,
        accentColor: colors.primary,
      },
      {
        label: 'Pending',
        value: analytics?.pendingCount ?? 0,
        color: colors.warning,
        icon: Clock3,
        progress: (analytics?.pendingCount ?? 0) / totalForProgress,
        accentColor: colors.warning,
      },
      {
        label: 'Confirmed',
        value: analytics?.confirmedCount ?? 0,
        color: colors.info,
        icon: CalendarCheck2,
        progress: (analytics?.confirmedCount ?? 0) / totalForProgress,
        accentColor: colors.info,
      },
      {
        label: 'Completed',
        value: analytics?.completedCount ?? 0,
        color: colors.success,
        icon: CheckCircle2,
        progress: (analytics?.completedCount ?? 0) / totalForProgress,
        accentColor: colors.success,
      },
      {
        label: 'Cancelled',
        value: analytics?.cancelledCount ?? 0,
        color: colors.error,
        icon: XCircle,
        progress: (analytics?.cancelledCount ?? 0) / totalForProgress,
        accentColor: colors.error,
      },
      {
        label: 'Expired',
        value: analytics?.expiredCount ?? 0,
        color: '#DC2626',
        icon: XCircle,
        progress: (analytics?.expiredCount ?? 0) / totalForProgress,
        accentColor: '#DC2626',
      },
      {
        label: 'No Show',
        value: analytics?.noShowCount ?? 0,
        color: '#B91C1C',
        icon: XCircle,
        progress: (analytics?.noShowCount ?? 0) / totalForProgress,
        accentColor: '#B91C1C',
      },
      {
        label: 'Today',
        value: analytics?.todayAppointments ?? 0,
        color: colors.primaryDark,
        icon: Stethoscope,
        progress: (analytics?.todayAppointments ?? 0) / totalForProgress,
        accentColor: colors.primaryDark,
      },
    ],
    [analytics, colors, totalForProgress],
  );

  const weeklyChartData = useMemo(
    () => ({
      labels: analytics?.weeklyStats.map(item => item.label) ?? [],
      datasets: [
        {
          data: analytics?.weeklyStats.map(item => item.count) ?? [],
        },
      ],
    }),
    [analytics?.weeklyStats],
  );

  const statusDistributionData = useMemo(
    () =>
      analytics?.statusDistribution
        .filter(item => item.count > 0)
        .map(item => ({
          ...item,
          legendFontColor: colors.textSecondary,
        })) ?? [],
    [analytics?.statusDistribution, colors.textSecondary],
  );

  const chartConfig = useMemo(
    () => ({
      backgroundColor: colors.card,
      backgroundGradientFrom: colors.card,
      backgroundGradientTo: colors.card,
      backgroundGradientFromOpacity: 1,
      backgroundGradientToOpacity: 1,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(46, 125, 255, ${opacity})`,
      labelColor: () => colors.textSecondary,
      barPercentage: 0.58,
      barRadius: 6,
      propsForBackgroundLines: {
        stroke: colors.border,
      },
      propsForLabels: {
        fontSize: scaleFont(9),
      },
    }),
    [colors],
  );

  const refreshSummary = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <ScreenWrapper scrollable>
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: typography.sizes.xxl },
            ]}
          >
            Admin Dashboard
          </Text>
        </View>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={140} />
          <Skeleton height={180} />
          <Skeleton height={120} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper scrollable>
        <ErrorState
          title="Admin Data Unavailable"
          message={error instanceof Error ? error.message : 'Please try again.'}
          buttonTitle="Retry"
          onRetry={refreshSummary}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshSummary}
      refreshing={isRefetching}
    >
      <View style={styles.header}>
        <View>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: typography.sizes.xxl },
            ]}
          >
            Admin Dashboard
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary, fontSize: typography.sizes.sm },
            ]}
          >
            Analytics and System Health
          </Text>
        </View>
        <AppButton
          title="Logout"
          variant="outline"
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: logout },
            ]);
          }}
          style={styles.logoutButton}
        />
      </View>

      {/* Card 1: Statistics Grid */}
      <CardFadeIn delay={0}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
              ]}
            >
              Statistics
            </Text>

            <View style={styles.statsGrid}>
              {statCards.map(item => {
                const Icon = item.icon;
                return (
                  <View
                    key={item.label}
                    style={[
                      styles.statMetricItem,
                      {
                        borderColor: colors.border,
                        borderRadius: radius.md,
                        backgroundColor: colors.background,
                        borderTopWidth: 3,
                        borderTopColor: item.accentColor,
                        overflow: 'hidden',
                      },
                    ]}
                  >
                    <View style={styles.statHeader}>
                      <View style={[styles.statIconPill, { backgroundColor: item.color + '15' }]}>
                        <Icon color={item.color} size={scaleFont(14)} />
                      </View>
                      <Text
                        style={[
                          styles.statValue,
                          { color: item.color, fontSize: typography.sizes.lg },
                        ]}
                      >
                        {item.value}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: colors.textSecondary, fontSize: typography.caption },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    <View style={{ marginTop: scaleFont(6) }}>
                      <ProgressBar
                        progress={Math.min(1, item.progress)}
                        color={item.accentColor}
                        height={scaleFont(3)}
                        trackColor={item.accentColor + '20'}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <Text
              style={[
                styles.chartTitle,
                { color: colors.text, fontSize: typography.sizes.md, marginTop: spacing.lg },
              ]}
            >
              Weekly Appointments
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={weeklyChartData}
                width={chartWidth}
                height={chartHeight}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={chartConfig}
                fromZero
                segments={4}
                showValuesOnTopOfBars
                style={styles.chart}
              />
            </ScrollView>

            <Text
              style={[
                styles.chartTitle,
                { color: colors.text, fontSize: typography.sizes.md, marginTop: spacing.lg },
              ]}
            >
              Status Distribution
            </Text>
            {statusDistributionData.length > 0 ? (
              <PieChart
                data={statusDistributionData}
                width={chartWidth}
                height={chartHeight}
                accessor="count"
                backgroundColor="transparent"
                paddingLeft="8"
                chartConfig={chartConfig}
                absolute
                hasLegend
                style={styles.chart}
              />
            ) : (
              <View style={[styles.emptyChart, { height: chartHeight }]}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                  }}
                >
                  No appointment status data yet.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* Card 2: Recent Activity */}
      <CardFadeIn delay={60}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
              ]}
            >
              Recent Activity
            </Text>
            {analytics?.recentActivity && analytics.recentActivity.length > 0 ? (
              analytics.recentActivity.map((activity, idx) => {
                let actionText = '';
                const timeStr = new Date(activity.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const staffName = activity.staffName || 'Staff Member';
                const tokenStr = activity.tokenNumber
                  ? `Token #${activity.tokenNumber}`
                  : 'Appointment';

                if (activity.action === 'confirm') {
                  actionText = `${staffName} confirmed ${tokenStr}`;
                } else if (activity.action === 'cancel') {
                  actionText = `${staffName} cancelled ${tokenStr}`;
                } else if (activity.action === 'call_next') {
                  actionText = `${staffName} called ${tokenStr}`;
                } else if (activity.action === 'complete_service') {
                  actionText = `${staffName} completed service for ${tokenStr}`;
                } else {
                  actionText = `${staffName} updated ${tokenStr} (${activity.action})`;
                }

                const meta = ACTION_META[activity.action] ?? { icon: Zap, color: colors.primary, label: activity.action };
                const ActionIcon = meta.icon;

                return (
                  <View
                    key={activity.id}
                    style={[
                      styles.activityItem,
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        paddingTop: spacing.sm,
                        marginTop: spacing.sm,
                      },
                    ]}
                  >
                    <View style={[styles.activityIconPill, { backgroundColor: meta.color + '15' }]}>
                      <ActionIcon size={scaleFont(14)} color={meta.color} />
                    </View>
                    <Text
                      style={[
                        styles.activityText,
                        { color: colors.text, fontSize: typography.sizes.sm },
                      ]}
                    >
                      {actionText}
                    </Text>
                    <Text
                      style={[
                        styles.activityTime,
                        { color: colors.textSecondary, fontSize: typography.caption },
                      ]}
                    >
                      {timeStr}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.textSecondary, fontSize: typography.sizes.sm },
                ]}
              >
                No recent activity logs.
              </Text>
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* Card 3: System Overview */}
      <CardFadeIn delay={120}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
              ]}
            >
              System Overview
            </Text>

            <View style={styles.systemMetricsGrid}>
              {[
                { label: 'Service Centers', value: analytics?.systemOverview?.totalCenters ?? 0, color: colors.primary },
                { label: 'Services', value: analytics?.systemOverview?.totalServices ?? 0, color: colors.info },
                { label: 'Registered Users', value: analytics?.systemOverview?.totalUsers ?? 0, color: colors.success },
              ].map((item, idx) => (
                <View key={item.label} style={styles.systemMetricItem}>
                  <Text
                    style={[
                      styles.systemMetricValue,
                      { color: item.color, fontSize: typography.sizes.xl },
                    ]}
                  >
                    {item.value}
                  </Text>
                  <Text
                    style={[
                      styles.systemMetricLabel,
                      { color: colors.textSecondary, fontSize: typography.caption },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.systemStatusRow,
                {
                  borderColor: colors.border,
                  paddingTop: spacing.md,
                  marginTop: spacing.md,
                },
              ]}
            >
              {/* Status pill */}
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: analytics?.systemOverview?.dbConnected
                      ? colors.success + '18'
                      : colors.error + '18',
                    borderColor: analytics?.systemOverview?.dbConnected
                      ? colors.success + '40'
                      : colors.error + '40',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: analytics?.systemOverview?.dbConnected
                        ? colors.success
                        : colors.error,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: analytics?.systemOverview?.dbConnected
                        ? colors.success
                        : colors.error,
                      fontSize: typography.sizes.sm,
                    },
                  ]}
                >
                  System: {analytics?.systemOverview?.dbConnected ? 'Operational' : 'Degraded'}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </CardFadeIn>
      
      <CardFadeIn delay={400}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <UserPlus color={colors.primary} size={scaleFont(24)} />
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: typography.sizes.lg, marginLeft: spacing.sm }]}>
                Team Management
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <AppButton
                title="➕ Staff Account"
                onPress={() => navigation.navigate('CreateAccount', { role: 'staff' })}
                style={{ flex: 1, backgroundColor: '#0284C7' }}
              />
              <AppButton
                title="➕ Admin Account"
                onPress={() => navigation.navigate('CreateAccount', { role: 'admin' })}
                style={{ flex: 1, backgroundColor: '#7C3AED' }}
              />
            </View>
          </Card>
        </View>
      </CardFadeIn>

    </ScreenWrapper>
  );
};

export default AdminDashboardScreen;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp(2.4),
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subtitle: {
    fontWeight: '500',
  },
  logoutButton: {
    minWidth: wp(24),
  },
  cardContent: {
    padding: wp(4),
  },
  cardTitle: {
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: wp(2),
  },
  statMetricItem: {
    flexBasis: '47%',
    flexGrow: 1,
    paddingHorizontal: wp(3),
    paddingVertical: hp(1.2),
    borderWidth: 1,
    marginBottom: hp(1),
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statIconPill: {
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: scaleFont(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontWeight: 'bold',
  },
  statLabel: {
    fontWeight: '500',
    marginTop: hp(0.5),
  },
  chartTitle: {
    fontWeight: '700',
  },
  chart: {
    marginLeft: -wp(2),
    marginTop: hp(1.5),
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: hp(2),
    fontWeight: '500',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(10),
  },
  activityIconPill: {
    width: scaleFont(30),
    height: scaleFont(30),
    borderRadius: scaleFont(15),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityText: {
    fontWeight: '600',
    flex: 1,
  },
  activityTime: {
    fontWeight: '500',
    flexShrink: 0,
  },
  systemMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  systemMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  systemMetricLabel: {
    fontWeight: '600',
    textAlign: 'center',
    marginTop: scaleFont(2),
  },
  systemMetricValue: {
    fontWeight: 'bold',
  },
  systemStatusRow: {
    borderTopWidth: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: scaleFont(12),
    paddingVertical: scaleFont(6),
    alignSelf: 'flex-start',
    gap: scaleFont(6),
  },
  statusDot: {
    width: scaleFont(8),
    height: scaleFont(8),
    borderRadius: scaleFont(4),
  },
  statusText: {
    fontWeight: '700',
  },
});
