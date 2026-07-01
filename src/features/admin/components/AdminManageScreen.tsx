import React, { useCallback, useMemo, useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { useQuery } from '@tanstack/react-query';
import {
  LogOut,
  UserPlus,
  Building,
  Shield,
  Activity,
  UserCheck,
  Stethoscope,
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useAuth } from '../../../hooks/useAuth';
import { useProfileStore } from '../../../store/profileStore';
import { useTheme } from '../../../hooks/useTheme';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { analyticsService } from '../api/analyticsService';
import { getDisplayName } from '../../../utils/getDisplayName';

const AdminManageScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout, user } = useAuth();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile?.id, fetchProfile]);

  const adminName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const {
    data: analytics,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-analytics-dashboard', 'all'],
    queryFn: () => analyticsService.getDashboardStats('all'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const refreshOverview = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <ScreenWrapper scrollable>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            System Control
          </Text>
        </View>
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
          <Skeleton height={100} />
          <Skeleton height={200} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper scrollable>
        <ErrorState
          title="Overview Unavailable"
          message={error instanceof Error ? error.message : 'Please try again.'}
          buttonTitle="Retry"
          onRetry={refreshOverview}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshOverview}
      refreshing={isRefetching}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            System Control
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Infrastructure and Management Panel
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
              backgroundColor: pressed ? colors.border + '30' : 'transparent',
              borderColor: colors.border,
            },
          ]}
        >
          <LogOut color={colors.text} size={20} />
        </Pressable>
      </View>

      {/* Database/System Status Row */}
      <CardFadeIn delay={20}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card variant="elevated" style={[styles.cardContent, { borderRadius: radius.md }]}>
            <View style={styles.statusRowContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shield color={colors.primary} size={20} />
                <Text style={[styles.statusTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
                  System Health & Status
                </Text>
              </View>
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
                    borderRadius: radius.full,
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
                      fontSize: 11,
                    },
                  ]}
                >
                  {analytics?.systemOverview?.dbConnected ? 'OPERATIONAL' : 'DEGRADED'}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Card: System Metrics Overview */}
      <CardFadeIn delay={40}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <Activity color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Database Totals
              </Text>
            </View>
            <View style={styles.systemMetricsGrid}>
              {[
                { label: 'Service Centers', value: analytics?.systemOverview?.totalCenters ?? 0, color: colors.primary, icon: Building },
                { label: 'Services', value: analytics?.systemOverview?.totalServices ?? 0, color: colors.info, icon: Stethoscope },
                { label: 'Registered Users', value: analytics?.systemOverview?.totalUsers ?? 0, color: colors.success, icon: UserCheck },
              ].map((item, idx) => {
                const MetricIcon = item.icon;
                return (
                  <View key={item.label} style={[styles.systemMetricItem, { borderColor: colors.border }]}>
                    <View style={[styles.metricIconPill, { backgroundColor: item.color + '10' }]}>
                      <MetricIcon color={item.color} size={18} />
                    </View>
                    <Text style={[styles.systemMetricValue, { color: colors.text, fontSize: typography.sizes.lg }]}>
                      {item.value}
                    </Text>
                    <Text style={[styles.systemMetricLabel, { color: colors.textSecondary, fontSize: typography.caption }]}>
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Card: Team Management Controls */}
      <CardFadeIn delay={80}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <UserPlus color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Quick Actions
              </Text>
            </View>
            <View style={{ gap: spacing.md }}>
              <AppButton
                title="Create Staff Account"
                onPress={() => navigation.navigate('CreateAccount', { role: 'staff' })}
                style={{ backgroundColor: colors.primary, borderRadius: radius.md }}
              />
              <AppButton
                title="Manage Clinics & Services"
                variant="outline"
                onPress={() => (navigation as any).navigate('ManageCenters')}
                style={{ borderColor: colors.border, borderRadius: radius.md }}
              />
            </View>
          </Card>
        </View>
      </CardFadeIn>
    </ScreenWrapper>
  );
};

export default AdminManageScreen;

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
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  logoutIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: wp(4),
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusTitle: {
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: scaleFont(10),
    paddingVertical: scaleFont(4),
    gap: scaleFont(6),
  },
  statusDot: {
    width: scaleFont(6),
    height: scaleFont(6),
    borderRadius: scaleFont(3),
  },
  statusText: {
    fontWeight: '800',
  },
  systemMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: wp(2),
  },
  systemMetricItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: hp(1.2),
    borderWidth: 1,
    borderRadius: 8,
  },
  metricIconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  systemMetricLabel: {
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  systemMetricValue: {
    fontWeight: '800',
  },
});
