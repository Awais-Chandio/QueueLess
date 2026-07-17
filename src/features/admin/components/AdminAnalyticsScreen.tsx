import React, { useCallback, useMemo, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart, PieChart } from 'react-native-chart-kit';
import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  XCircle,
  Stethoscope,
  LogOut,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
} from 'lucide-react-native';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useAuth } from '../../../hooks/useAuth';
import { useProfileStore } from '../../../store/profileStore';
import { useTheme } from '../../../hooks/useTheme';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { analyticsService } from '../api/analyticsService';
import { getDisplayName } from '../../../utils/getDisplayName';

const AdminAnalyticsScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout, user } = useAuth();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const profileId = profile?.id;

  useEffect(() => {
    if (user?.id && profileId !== user.id) {
      fetchProfile(user.id);
    }
  }, [user?.id, profileId, fetchProfile]);

  const adminName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const { width } = useWindowDimensions();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');

  const {
    data: analytics,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-analytics-dashboard', dateRange],
    queryFn: () => analyticsService.getDashboardStats(dateRange),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const horizontalPadding = wp(4);
  const chartWidth = Math.max(
    280,
    Math.floor(width - horizontalPadding * 2 - spacing.md * 2 - wp(4)),
  );
  const chartHeight = Math.max(180, hp(22));

  const totalForProgress = analytics?.totalAppointments || 1;

  const statCards = useMemo(
    () => [
      {
        label: 'Total Appts',
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
        color: colors.error,
        icon: XCircle,
        progress: (analytics?.expiredCount ?? 0) / totalForProgress,
        accentColor: colors.error,
      },
      {
        label: 'No Show',
        value: analytics?.noShowCount ?? 0,
        color: colors.error,
        icon: XCircle,
        progress: (analytics?.noShowCount ?? 0) / totalForProgress,
        accentColor: colors.error,
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

  const bookingsTrendChartData = useMemo(() => {
    const trend = analytics?.bookingsTrend || [];
    return {
      labels: trend.map(item => {
        const d = new Date(item.booking_date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }) ?? [],
      datasets: [
        {
          data: trend.map(item => Number(item.count)) ?? [],
        },
      ],
    };
  }, [analytics?.bookingsTrend]);

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
      backgroundColor: colors.surface,
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      backgroundGradientFromOpacity: 1,
      backgroundGradientToOpacity: 1,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(15, 118, 110, ${opacity})`,
      labelColor: () => colors.textSecondary,
      barPercentage: 0.58,
      barRadius: 6,
      propsForBackgroundLines: {
        stroke: colors.border + '30',
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
      <ScreenWrapper>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800' }]}>
            Analytics
          </Text>
        </View>
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
          <Skeleton height={60} borderRadius={radius.lg} />
          <Skeleton height={240} borderRadius={radius.lg} />
          <Skeleton height={200} borderRadius={radius.lg} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Analytics Data Unavailable"
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800', letterSpacing: 0.3 }]}>
            Welcome, {adminName}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600' }]}>
            Overview & Queue Performance
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: logout },
            ]);
          }}
          style={({ pressed }) => [
            styles.logoutIconButton,
            {
              backgroundColor: pressed ? colors.border + '30' : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <LogOut color={colors.text} size={18} />
        </Pressable>
      </View>

      {/* Timeframe Selector */}
      <CardFadeIn delay={20}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={[styles.cardContent, { padding: spacing.sm, borderRadius: radius.xl }]}>
            <View style={styles.timeframeContainer}>
              <View style={styles.timeframeLabelRow}>
                <TrendingUp color={colors.primary} size={16} />
                <Text style={[styles.timeframeLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  Timeframe:
                </Text>
              </View>
              <View style={styles.timeframeButtons}>
                {[
                  { key: 'all' as const, label: 'All Time' },
                  { key: 'today' as const, label: 'Today' },
                  { key: 'week' as const, label: '7 Days' },
                  { key: 'month' as const, label: '30 Days' },
                ].map(item => (
                  <Pressable
                    key={item.key}
                    onPress={() => setDateRange(item.key)}
                    style={[
                      styles.timeframeButton,
                      {
                        borderColor: dateRange === item.key ? colors.primary : colors.border,
                        backgroundColor: dateRange === item.key ? `${colors.primary}12` : 'transparent',
                        borderRadius: radius.md,
                        borderWidth: 1.2,
                      }
                    ]}
                  >
                    <Text style={{ color: dateRange === item.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '800' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Grid: Statistics */}
      <CardFadeIn delay={40}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={[styles.cardContent, { padding: spacing.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.md }]}>
              Statistics Grid
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
                        borderColor: colors.border + '50',
                        borderRadius: radius.lg,
                        backgroundColor: colors.surface,
                        borderTopWidth: 3,
                        borderTopColor: item.accentColor,
                      },
                    ]}
                  >
                    <View style={styles.statHeader}>
                      <View style={[styles.statIconPill, { backgroundColor: item.color + '12' }]}>
                        <Icon color={item.color} size={scaleFont(12)} />
                      </View>
                      <Text style={[styles.statValue, { color: item.color, fontSize: typography.sizes.md, fontWeight: '800' }]}>
                        {item.value}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: colors.textSecondary, fontSize: typography.caption, fontWeight: '700' },
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
                        trackColor={item.accentColor + '12'}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Chart 1: Bookings Trend */}
      <CardFadeIn delay={80}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={[styles.cardContent, { padding: spacing.md }]}>
            <View style={styles.chartHeaderRow}>
              <BarChart3 color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Bookings Trend
              </Text>
            </View>
            {bookingsTrendChartData.labels.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <BarChart
                  data={bookingsTrendChartData}
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
            ) : (
              <View style={[styles.emptyChart, { height: chartHeight }]}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                  No bookings trend data available for this timeframe.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* Chart 2: Status Distribution */}
      <CardFadeIn delay={120}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={[styles.cardContent, { padding: spacing.md }]}>
            <View style={styles.chartHeaderRow}>
              <PieIcon color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Status Distribution
              </Text>
            </View>
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
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                  No status distribution data available for this timeframe.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* List 1: Busiest Services */}
      <CardFadeIn delay={160}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card style={[styles.cardContent, { padding: spacing.md }]}>
            <View style={styles.chartHeaderRow}>
              <ClipboardList color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Busiest Services
              </Text>
            </View>
            {analytics?.busiestServices && analytics.busiestServices.length > 0 ? (
              <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
                {analytics.busiestServices.map((item, index) => {
                  const maxCount = Number(analytics.busiestServices[0]?.count) || 1;
                  const ratio = Number(item.count) / maxCount;
                  return (
                    <View key={item.service_name} style={styles.rankedItem}>
                      <View style={styles.rankedItemHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.rankedRank, { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: '800' }]}>
                            #{index + 1}
                          </Text>
                          <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700' }}>
                            {item.service_name}
                          </Text>
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: '600' }}>
                          {item.count} bookings
                        </Text>
                      </View>
                      <View style={{ marginTop: 6 }}>
                        <ProgressBar progress={ratio} color={colors.primary} height={5} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', paddingVertical: spacing.md }}>
                  No services data available.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* List 2: Staff Performance */}
      <CardFadeIn delay={200}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <Card style={[styles.cardContent, { padding: spacing.md }]}>
            <View style={styles.chartHeaderRow}>
              <Stethoscope color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Staff Performance
              </Text>
            </View>
            {analytics?.staffPerformance && analytics.staffPerformance.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                {analytics.staffPerformance.map((item, index) => (
                  <View
                    key={item.staff_name}
                    style={[
                      styles.staffItem,
                      {
                        borderColor: colors.border + '30',
                        borderRadius: radius.md,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        padding: spacing.sm,
                      },
                    ]}
                  >
                    <View style={styles.staffItemHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.primary, fontSize: typography.sizes.sm, fontWeight: '800' }}>
                          #{index + 1}
                        </Text>
                        <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700' }}>
                          {item.staff_name}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>
                          {item.completed_count} completed
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>
                          Avg. Time: {item.avg_time_minutes} mins
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', paddingVertical: spacing.md }}>
                  No staff performance data available.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>
    </ScreenWrapper>
  );
};

export default AdminAnalyticsScreen;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: wp(4),
    marginTop: hp(1.5),
    marginBottom: hp(2),
  },
  title: {
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
  },
  logoutIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {},
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  timeframeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeframeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeframeLabel: {
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeframeButtons: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  timeframeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    borderWidth: 0.5,
    marginBottom: hp(0.8),
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statIconPill: {
    width: scaleFont(24),
    height: scaleFont(24),
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {},
  statLabel: {
    marginTop: hp(0.5),
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: hp(1),
  },
  chart: {
    marginLeft: -wp(2),
    marginTop: hp(1),
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankedItem: {
    marginBottom: hp(0.5),
  },
  rankedItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rankedRank: {
    fontWeight: '800',
  },
  staffItem: {
    borderWidth: 1,
    padding: 10,
    marginBottom: hp(0.5),
  },
  staffItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
