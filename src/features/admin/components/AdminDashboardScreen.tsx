import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
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
        contentContainerStyle={[styles.content, { padding: spacing.lg }]}
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

        <View style={[styles.statsGrid, { gap: spacing.md }]}>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: typography.sizes.xxl }]}>
              {summary?.centers ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Centers
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: typography.sizes.xxl }]}>
              {summary?.services ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Services
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: typography.sizes.xxl }]}>
              {summary?.users ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Users
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: typography.sizes.xxl }]}>
              {summary?.appointments ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Appointments
            </Text>
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
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    width: 110,
  },
  manageDescription: {
    lineHeight: 20,
    marginTop: 4,
  },
  manageTitle: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  statCard: {
    flexBasis: '47%',
  },
  statLabel: {
    marginTop: 4,
  },
  statValue: {
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  subtitle: {
    marginTop: 4,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
});
