import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, Settings2, Users } from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { adminService } from '../api/adminService';

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
  const {
    data: summary,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-summary'],
    queryFn: adminService.fetchSummary,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const refreshSummary = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
          Admin Dashboard
        </Text>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
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
        contentContainerStyle={[styles.content, { paddingHorizontal: wp(4), paddingVertical: hp(2) }]}
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
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
              Admin Dashboard
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
              Analytics and management
            </Text>
          </View>
          <AppButton title="Logout" variant="outline" onPress={logout} style={styles.logoutButton} />
        </View>

        <View style={[styles.statsGrid, { gap: wp(3) }]}>
          <Card style={styles.statCard}>
            <View style={styles.statHeader}>
              <Building2 color={colors.primary} size={scaleFont(20)} />
              <Text style={[styles.statValue, { color: colors.primary, fontSize: typography.sizes.xxl }]}>
                {summary?.centers ?? 0}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Centers</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statHeader}>
              <Settings2 color={colors.info} size={scaleFont(20)} />
              <Text style={[styles.statValue, { color: colors.info, fontSize: typography.sizes.xxl }]}>
                {summary?.services ?? 0}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Services</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statHeader}>
              <Users color={colors.success} size={scaleFont(20)} />
              <Text style={[styles.statValue, { color: colors.success, fontSize: typography.sizes.xxl }]}>
                {summary?.users ?? 0}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Users</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statHeader}>
              <CalendarDays color={colors.warning} size={scaleFont(20)} />
              <Text style={[styles.statValue, { color: colors.warning, fontSize: typography.sizes.xxl }]}>
                {summary?.appointments ?? 0}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Appointments</Text>
          </Card>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.lg, marginTop: spacing.xl }]}>
          Management
        </Text>
        {managementSections.map(section => (
          <Card key={section.key} variant="outlined" style={{ marginTop: spacing.md }}>
            <Text style={[styles.manageTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
              {section.title}
            </Text>
            <Text style={[styles.manageDescription, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              {section.description}
            </Text>
          </Card>
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
    flexBasis: '48%',
    flexGrow: 1,
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
});
