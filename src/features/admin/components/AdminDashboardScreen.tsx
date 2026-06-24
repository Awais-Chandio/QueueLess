import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
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
  Stethoscope,
  XCircle,
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { analyticsService } from '../api/analyticsService';
import { toastService } from '../../../services/toastService';

const managementSections = [
  {
    title: 'Centers',
    description: 'Manage service center availability and metadata.',
    key: 'centers',
  },
  {
    title: 'Services',
    description: 'Manage offered services, pricing, and durations.',
    key: 'services',
  },
  {
    title: 'Users',
    description: 'Review users and role assignments from profiles.',
    key: 'users',
  },
];

const AdminDashboardScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
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
    Math.floor(width - horizontalPadding * 2 - spacing.md * 2),
  );
  const chartHeight = Math.max(190, hp(24));

  const statCards = useMemo(
    () => [
      {
        label: 'Total Appointments',
        value: analytics?.totalAppointments ?? 0,
        color: colors.primary,
        icon: ClipboardList,
        backgroundColor: colors.primaryLight,
      },
      {
        label: 'Pending',
        value: analytics?.pendingCount ?? 0,
        color: colors.warning,
        icon: Clock3,
        backgroundColor: '#FEF3C7',
      },
      {
        label: 'Confirmed',
        value: analytics?.confirmedCount ?? 0,
        color: colors.info,
        icon: CalendarCheck2,
        backgroundColor: colors.primaryLight,
      },
      {
        label: 'Completed',
        value: analytics?.completedCount ?? 0,
        color: colors.success,
        icon: CheckCircle2,
        backgroundColor: '#DCFCE7',
      },
      {
        label: 'Cancelled',
        value: analytics?.cancelledCount ?? 0,
        color: colors.error,
        icon: XCircle,
        backgroundColor: '#FEE2E2',
      },
    ],
    [analytics, colors],
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
      barRadius: 7,
      propsForBackgroundLines: {
        stroke: colors.border,
      },
      propsForLabels: {
        fontSize: scaleFont(10),
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
        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: typography.sizes.xxl },
          ]}
        >
          Admin Dashboard
        </Text>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={220} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper>
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
    <ScreenWrapper withPadding={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: wp(4), paddingVertical: hp(2) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            tintColor={colors.primary}
            onRefresh={refreshSummary}
          />
        }
        showsVerticalScrollIndicator={false}
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
                { color: colors.textSecondary, fontSize: typography.sizes.md },
              ]}
            >
              Appointment analytics and management
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

        <View style={[styles.statsGrid, { gap: wp(3) }]}>
          {statCards.map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.label} style={styles.statCard}>
                <View style={styles.statHeader}>
                  <View
                    style={[
                      styles.iconBadge,
                      { backgroundColor: item.backgroundColor },
                    ]}
                  >
                    <Icon color={item.color} size={scaleFont(20)} />
                  </View>
                  <Text
                    style={[
                      styles.statValue,
                      { color: item.color, fontSize: typography.sizes.xxl },
                    ]}
                  >
                    {item.value}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.statLabel,
                    {
                      color: colors.textSecondary,
                      fontSize: typography.sizes.sm,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Card>
            );
          })}
        </View>

        <View
          style={[
            styles.todayPanel,
            { backgroundColor: colors.primaryLight, marginTop: spacing.md },
          ]}
        >
          <View style={styles.todayIcon}>
            <Stethoscope color={colors.primaryDark} size={scaleFont(20)} />
          </View>
          <View style={styles.todayText}>
            <Text
              style={[
                styles.todayLabel,
                { color: colors.primaryDark, fontSize: typography.sizes.sm },
              ]}
            >
              Today Appointments
            </Text>
            <Text
              style={[
                styles.todayValue,
                { color: colors.primaryDark, fontSize: typography.sizes.xl },
              ]}
            >
              {analytics?.todayAppointments ?? 0}
            </Text>
          </View>
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          <Text
            style={[
              styles.chartTitle,
              { color: colors.text, fontSize: typography.sizes.md },
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
              withInnerLines
              style={styles.chart}
            />
          </ScrollView>
        </Card>

        <Card style={{ marginTop: spacing.lg }}>
          <Text
            style={[
              styles.chartTitle,
              { color: colors.text, fontSize: typography.sizes.md },
            ]}
          >
            Appointment Status Distribution
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
                style={[
                  styles.emptyChartText,
                  {
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                  },
                ]}
              >
                No appointment status data yet.
              </Text>
            </View>
          )}
        </Card>

        <Text
          style={[
            styles.sectionTitle,
            {
              color: colors.text,
              fontSize: typography.sizes.lg,
              marginTop: spacing.xl,
            },
          ]}
        >
          Management
        </Text>
        {managementSections.map(section => (
          <Pressable
            key={section.key}
            onPress={() =>
              toastService.info(`${section.title} management coming soon!`)
            }
          >
            <Card variant="outlined" style={{ marginTop: spacing.md }}>
              <Text
                style={[
                  styles.manageTitle,
                  { color: colors.text, fontSize: typography.sizes.md },
                ]}
              >
                {section.title}
              </Text>
              <Text
                style={[
                  styles.manageDescription,
                  {
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                  },
                ]}
              >
                {section.description}
              </Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenWrapper>
  );
};

export default AdminDashboardScreen;

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(3),
    justifyContent: 'space-between',
    marginBottom: hp(2.4),
  },
  chart: {
    marginLeft: -wp(3),
    marginTop: hp(1.5),
  },
  chartTitle: {
    fontWeight: '700',
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontWeight: '600',
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: scaleFont(40),
    justifyContent: 'center',
    width: scaleFont(40),
  },
  logoutButton: {
    alignSelf: 'flex-start',
    minWidth: wp(28),
  },
  manageDescription: {
    lineHeight: scaleFont(20),
    marginTop: hp(0.5),
  },
  manageTitle: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: hp(12),
  },
  statHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    marginTop: hp(0.7),
  },
  statValue: {
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  subtitle: {
    marginTop: hp(0.5),
  },
  title: {
    fontWeight: 'bold',
    marginBottom: hp(0.5),
  },
  todayIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayLabel: {
    fontWeight: '700',
  },
  todayPanel: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: wp(3),
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.6),
  },
  todayText: {
    flex: 1,
  },
  todayValue: {
    fontWeight: 'bold',
    marginTop: hp(0.2),
  },
});
