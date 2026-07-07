import React, { useCallback, useMemo, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  BellRing,
  CheckCheck,
  Zap,
  LogOut,
  Search,
  History,
  Info,
} from 'lucide-react-native';
import AppInput from '../../../components/ui/AppInput';
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

const ACTION_META: Record<string, { icon: any; color: string; label: string }> = {
  confirm: { icon: CheckCircle2, color: '#10B981', label: 'Confirmed' },
  cancel: { icon: XCircle, color: '#EF4444', label: 'Cancelled' },
  call_next: { icon: BellRing, color: '#8B5CF6', label: 'Called' },
  complete_service: { icon: CheckCheck, color: '#10B981', label: 'Completed' },
};

const AdminLogsScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout, user } = useAuth();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile?.id, fetchProfile]);

  const adminName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<string>('all');

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

  const filteredActivities = useMemo(() => {
    const list = analytics?.recentActivity ?? [];
    return list.filter(activity => {
      // 1. Action Filter
      if (logActionFilter !== 'all' && activity.action !== logActionFilter) {
        return false;
      }
      // 2. Search Query Filter
      if (logSearchQuery.trim() !== '') {
        const query = logSearchQuery.toLowerCase();
        const staff = activity.staffName?.toLowerCase() || '';
        const token = activity.tokenNumber?.toString() || '';
        const act = activity.action.toLowerCase();
        return (
          staff.includes(query) ||
          token.includes(query) ||
          act.includes(query)
        );
      }
      return true;
    });
  }, [analytics?.recentActivity, logSearchQuery, logActionFilter]);

  const refreshLogs = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <ScreenWrapper scrollable>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            Activity Logs
          </Text>
        </View>
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
          <Skeleton height={50} borderRadius={radius.lg} />
          <Skeleton height={40} borderRadius={radius.lg} />
          <Skeleton height={300} borderRadius={radius.lg} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper scrollable>
        <ErrorState
          title="Logs Unavailable"
          message={error instanceof Error ? error.message : 'Please try again.'}
          buttonTitle="Retry"
          onRetry={refreshLogs}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshLogs}
      refreshing={isRefetching}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800' }]}>
            Activity Logs
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '500' }]}>
            Monitor and Search Staff Actions
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

      {/* Search Input */}
      <CardFadeIn delay={20}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
          <AppInput
            placeholder="Search logs by staff name or token..."
            value={logSearchQuery}
            onChangeText={setLogSearchQuery}
            leftIcon={Search}
          />
        </View>
      </CardFadeIn>

      {/* Action Filter Pills */}
      <CardFadeIn delay={40}>
        <View style={{ marginBottom: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filtersContainer, { paddingHorizontal: spacing.md }]}
          >
            {[
              { key: 'all', label: 'All Actions' },
              { key: 'confirm', label: 'Confirmed' },
              { key: 'cancel', label: 'Cancelled' },
              { key: 'call_next', label: 'Called' },
              { key: 'complete_service', label: 'Completed' },
            ].map(actionItem => (
              <Pressable
                key={actionItem.key}
                onPress={() => setLogActionFilter(actionItem.key)}
                style={[
                  styles.filterPill,
                  {
                    borderColor: logActionFilter === actionItem.key ? colors.primary : colors.border,
                    backgroundColor: logActionFilter === actionItem.key ? `${colors.primary}10` : colors.surface,
                    borderRadius: radius.full,
                    borderWidth: 1.5,
                  }
                ]}
              >
                <Text
                  style={{
                    color: logActionFilter === actionItem.key ? colors.primary : colors.text,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {actionItem.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </CardFadeIn>

      {/* Logs List Card */}
      <CardFadeIn delay={60}>
        <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={styles.listHeader}>
              <History color={colors.primary} size={18} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Audit Trail
              </Text>
            </View>

            {filteredActivities && filteredActivities.length > 0 ? (
              filteredActivities.map((activity, idx) => {
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
                        borderTopColor: colors.border + '50',
                        paddingTop: spacing.sm,
                        marginTop: spacing.sm,
                      },
                    ]}
                  >
                    <View style={[styles.activityIconPill, { backgroundColor: meta.color + '10' }]}>
                      <ActionIcon size={scaleFont(12)} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityText, { color: colors.text, fontSize: typography.sizes.sm }]}>
                        {actionText}
                      </Text>
                      <View style={styles.actionMetaRow}>
                        <View style={[styles.actionTag, { backgroundColor: meta.color + '10' }]}>
                          <Text style={[styles.actionTagText, { color: meta.color }]}>
                            {meta.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[styles.activityTime, { color: colors.textSecondary, fontSize: typography.caption }]}>
                      {timeStr}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyContainer}>
                <Info color={colors.textSecondary} size={28} style={{ marginBottom: 8 }} />
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                  No recent activity logs match your search.
                </Text>
              </View>
            )}
          </Card>
        </View>
      </CardFadeIn>
    </ScreenWrapper>
  );
};

export default AdminLogsScreen;

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
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: wp(4.5),
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  filtersContainer: {
    gap: 8,
    paddingBottom: 4,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: hp(1.5),
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scaleFont(10),
  },
  activityIconPill: {
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  activityText: {
    fontWeight: '600',
    lineHeight: 18,
  },
  actionMetaRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  actionTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionTagText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  activityTime: {
    fontWeight: '600',
    flexShrink: 0,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(4),
  },
});
