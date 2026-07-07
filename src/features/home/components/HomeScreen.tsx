import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet, Text, Pressable } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { LinearGradient } from 'react-native-linear-gradient';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { CircularProgress } from '../../../components/ui/CircularProgress';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../../navigation/types';
import {
  Bell,
  Calendar,
  Clock,
  User,
  CircleDot,
  Users,
  Hash,
  Activity,
  ChevronRight,
} from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useProfileStore } from '../../../store/profileStore';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import ProfileAvatar from '../../../components/ui/ProfileAvatar';
import {
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
} from '../../appointments/utils/appointmentTime';
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue';
import type { AppointmentStatus } from '../../../types/appointment';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../../services/bookingService';

import { getDisplayName } from '../../../utils/getDisplayName';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const HomeScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats();
  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const isProfileLoading = useProfileStore(state => state.isLoading);

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile?.id, fetchProfile]);

  const displayName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const activeAppointment = stats?.activeAppointment;
  const resolvedActiveApptStatus = useMemo(() => {
    if (!activeAppointment) return null;
    const apptFull = {
      ...activeAppointment,
      scheduled_at: activeAppointment.scheduledAt,
      estimated_wait_mins: 30,
      status: activeAppointment.status,
    } as any;
    const { resolvedStatus } = getAppointmentStatusState(apptFull);
    return resolvedStatus;
  }, [activeAppointment]);

  const hasActiveQueueAppt = useMemo(() => {
    return (
      activeAppointment &&
      resolvedActiveApptStatus &&
      ['pending', 'confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedActiveApptStatus)
    );
  }, [activeAppointment, resolvedActiveApptStatus]);

  const activeToken =
    typeof activeAppointment?.tokenNumber === 'number' && hasActiveQueueAppt
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
  const screenFade = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(1)).current;

  // Screen fade-in on mount
  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [screenFade]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (activeAppointment && activeToken != null && hasActiveQueueAppt) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(livePulse, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(livePulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      livePulse.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [activeAppointment, activeToken, hasActiveQueueAppt, livePulse]);

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
    queueData?.peopleAhead,
    resolvedActiveApptStatus,
  ]);

  const refreshHome = useCallback(async () => {
    await Promise.all([
      refetch(),
      user?.id ? fetchProfile(user.id) : Promise.resolve(),
    ]);
  }, [fetchProfile, refetch, user?.id]);

  const nextApptDate = useMemo(() => {
    if (!activeAppointment) return '';
    return getAppointmentDateLabel({
      appointment_date: activeAppointment.appointmentDate,
      scheduled_at: activeAppointment.scheduledAt,
    });
  }, [activeAppointment]);

  const nextApptTime = useMemo(() => {
    if (!activeAppointment) return '';
    return getAppointmentTimeLabel({
      appointment_time: activeAppointment.appointmentTime,
      scheduled_at: activeAppointment.scheduledAt,
    });
  }, [activeAppointment]);

  // Queue progress: how far currentToken is toward your token
  const currentToken = queueData?.currentToken ?? 0;
  const yourToken = activeToken ?? 0;
  const queueProgress = useMemo(() => {
    if (!hasActiveQueueAppt || yourToken === 0) return 0;
    if (currentToken >= yourToken) return 1;
    return Math.max(0, currentToken / yourToken);
  }, [hasActiveQueueAppt, currentToken, yourToken]);

  const peopleAhead = queueData?.peopleAhead ?? 0;

  const statusProps = getStatusDisplayProperties(resolvedActiveApptStatus || (activeAppointment?.status as AppointmentStatus));

  return (
    <Animated.View style={[styles.screen, { opacity: screenFade }]}>
      <ScreenWrapper
        scrollable
        onRefresh={refreshHome}
        refreshing={isRefetching || isProfileLoading}
      >
        {/* A. Welcome Header */}
        <CardFadeIn delay={0}>
          <View style={[styles.header, { marginBottom: spacing.lg }]}>
            <View style={styles.headerText}>
              <Text
                style={[
                  styles.welcomeText,
                  { color: colors.textSecondary, fontSize: typography.sizes.md },
                ]}
              >
                Welcome,
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
                {displayName}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => navigation.navigate('MainTabs', { screen: 'Notifications' })}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { marginRight: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                  pressed && styles.pressedEffect,
                ]}
              >
                <Bell color={colors.text} size={scaleFont(20)} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
                style={({ pressed }) => [
                  styles.avatarRing,
                  { borderColor: colors.primary + '50' },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <ProfileAvatar uri={profile?.avatar_url} size={48} />
              </Pressable>
            </View>
          </View>
        </CardFadeIn>

        {/* B. Queue Status Card */}
        <CardFadeIn delay={60}>
          <Animated.View style={{ transform: [{ scale: queuePulse }], marginBottom: spacing.lg }}>
            <Card variant="elevated" style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.text, fontSize: typography.sizes.lg },
                  ]}
                >
                  Queue Status
                </Text>
                {activeAppointment && activeToken != null && hasActiveQueueAppt && (
                  <View
                    style={[
                      styles.liveBadge,
                      { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}30`, borderWidth: 1 },
                    ]}
                  >
                    <Animated.View style={{ opacity: livePulse, marginRight: scaleFont(4), justifyContent: 'center', alignItems: 'center' }}>
                      <CircleDot color={colors.success} size={scaleFont(11)} />
                    </Animated.View>
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
                )}
              </View>

              {isLoading || queueLoading ? (
                <View style={styles.skeletonRow}>
                  <Skeleton height={40} width="30%" />
                  <Skeleton height={40} width="30%" />
                  <Skeleton height={40} width="30%" />
                </View>
              ) : activeAppointment && activeToken != null && hasActiveQueueAppt ? (
                <View>
                  {/* Circular progress + token progress bar */}
                  <View style={styles.queueVisualRow}>
                    <CircularProgress
                      progress={queueProgress}
                      size={scaleFont(100)}
                      strokeWidth={8}
                      color={colors.primary}
                      trackColor={colors.border}
                      centerLabel={`#${yourToken}`}
                      centerCaption="Your Token"
                      centerLabelColor={colors.primary}
                      centerCaptionColor={colors.textSecondary}
                    />
                    <View style={styles.queueMetrics}>
                      {/* Metric: Current Token */}
                      <View style={styles.metricRow}>
                        <View style={[styles.metricIcon, { backgroundColor: `${colors.textSecondary}15` }]}>
                          <Hash size={scaleFont(12)} color={colors.textSecondary} />
                        </View>
                        <View>
                          <Text style={[styles.metricCaption, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                            Current Token
                          </Text>
                          <Text style={[styles.metricValue, { color: colors.text, fontSize: typography.sizes.lg }]}>
                            #{currentToken}
                          </Text>
                        </View>
                      </View>
                      {/* Metric: People Ahead */}
                      <View style={[styles.metricRow, { marginTop: scaleFont(8) }]}>
                        <View style={[styles.metricIcon, { backgroundColor: `${colors.warning}15` }]}>
                          <Users size={scaleFont(12)} color={colors.warning} />
                        </View>
                        <View>
                          <Text style={[styles.metricCaption, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                            People Ahead
                          </Text>
                          <Text style={[styles.metricValue, { color: colors.warning, fontSize: typography.sizes.lg }]}>
                            {peopleAhead}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Token progress bar */}
                  <View style={[styles.progressSection, { marginTop: scaleFont(10) }]}>
                    <View style={styles.progressLabels}>
                      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}># {currentToken}</Text>
                      <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>Your #{yourToken}</Text>
                    </View>
                    <ProgressBar progress={queueProgress} color={colors.primary} height={scaleFont(6)} />
                  </View>
                </View>
              ) : (
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.textSecondary, fontSize: typography.sizes.sm },
                  ]}
                >
                  No active appointments in queue.
                </Text>
              )}

              {queueError && (
                <Text
                  style={{
                    color: colors.error,
                    fontSize: typography.sizes.sm,
                    marginTop: spacing.sm,
                    textAlign: 'center',
                  }}
                >
                  {queueError}
                </Text>
              )}
            </Card>
          </Animated.View>
        </CardFadeIn>

        {/* C. Next Appointment Card */}
        <CardFadeIn delay={120}>
          <View style={{ marginBottom: spacing.lg }}>
            <Card variant="elevated" style={styles.cardContent}>
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
                ]}
              >
                Next Appointment
              </Text>

              {isLoading ? (
                <View style={styles.skeletonRow}>
                  <Skeleton height={40} width="30%" />
                  <Skeleton height={40} width="30%" />
                  <Skeleton height={40} width="30%" />
                </View>
              ) : activeAppointment ? (
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <View style={[styles.apptIconPill, { backgroundColor: `${colors.primary}12` }]}>
                      <Calendar size={scaleFont(14)} color={colors.primary} />
                    </View>
                    <Text
                      style={[
                        styles.metricLabel,
                        { color: colors.textSecondary, fontSize: typography.caption, marginTop: hp(0.4) },
                      ]}
                    >
                      Date
                    </Text>
                    <Text
                      style={[
                        styles.metricTextValue,
                        { color: colors.text, fontSize: typography.sizes.sm },
                      ]}
                    >
                      {nextApptDate}
                    </Text>
                  </View>

                  <View style={styles.metricItem}>
                    <View style={[styles.apptIconPill, { backgroundColor: `${colors.info}12` }]}>
                      <Clock size={scaleFont(14)} color={colors.info} />
                    </View>
                    <Text
                      style={[
                        styles.metricLabel,
                        { color: colors.textSecondary, fontSize: typography.caption, marginTop: hp(0.4) },
                      ]}
                    >
                      Time
                    </Text>
                    <Text
                      style={[
                        styles.metricTextValue,
                        { color: colors.text, fontSize: typography.sizes.sm },
                      ]}
                    >
                      {nextApptTime}
                    </Text>
                  </View>

                  <View style={styles.metricItem}>
                    <View style={[styles.apptIconPill, { backgroundColor: `${colors.success}12` }]}>
                      <CircleDot size={scaleFont(14)} color={colors.success} />
                    </View>
                    <Text
                      style={[
                        styles.metricLabel,
                        { color: colors.textSecondary, fontSize: typography.caption, marginTop: hp(0.4) },
                      ]}
                    >
                      Status
                    </Text>
                    <View style={{ marginTop: hp(0.4) }}>
                      <StatusChip
                        status={resolvedActiveApptStatus || activeAppointment.status as any}
                        label={statusProps.label}
                        size="sm"
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.textSecondary, fontSize: typography.sizes.sm },
                  ]}
                >
                  No upcoming appointments.
                </Text>
              )}
            </Card>
          </View>
        </CardFadeIn>

        {/* D. Quick Actions */}
        <CardFadeIn delay={180}>
          <View style={{ marginBottom: spacing.lg }}>
            <Card variant="elevated" style={styles.cardContent}>
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
                ]}
              >
                Quick Actions
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => navigation.navigate('MainTabs', { screen: 'MyAppointments' })}
                  style={({ pressed }) => [
                    styles.actionItem,
                    pressed && styles.pressedEffect,
                  ]}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: `${colors.primary}12` }]}>
                    <Calendar size={scaleFont(22)} color={colors.primary} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: typography.caption }]}>
                    Appointments
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('MainTabs', { screen: 'Notifications' })}
                  style={({ pressed }) => [
                    styles.actionItem,
                    pressed && styles.pressedEffect,
                  ]}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: `${colors.warning}12` }]}>
                    <Bell size={scaleFont(22)} color={colors.warning} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: typography.caption }]}>
                    Notifications
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
                  style={({ pressed }) => [
                    styles.actionItem,
                    pressed && styles.pressedEffect,
                  ]}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: `${colors.success}12` }]}>
                    <User size={scaleFont(22)} color={colors.success} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: typography.caption }]}>
                    Profile
                  </Text>
                </Pressable>
              </View>
            </Card>
          </View>
        </CardFadeIn>

        {/* E. Recent Activity */}
        <CardFadeIn delay={240}>
          <View style={{ marginBottom: spacing.xl }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.lg }]}>Recent Activity</Text>
              <Pressable style={styles.viewAllBtn}>
                <Text style={{ color: colors.primary, fontSize: typography.sizes.sm, fontWeight: '600' }}>View All</Text>
                <ChevronRight size={16} color={colors.primary} />
              </Pressable>
            </View>
            <Card variant="elevated" style={styles.activityCard}>
              {stats?.todayAppointments?.length ? (
                 stats.todayAppointments.slice(0, 2).map((appt: any, index: number) => (
                   <View key={appt.id} style={[styles.activityItem, index !== 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                     <View style={[styles.activityIconContainer, { backgroundColor: `${colors.primary}12` }]}>
                       <Activity size={20} color={colors.primary} />
                     </View>
                      <View style={styles.activityContent}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: typography.sizes.sm }}>{appt.serviceName || 'Clinic Appointment'}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{appt.centerName || 'QueueLess Center'} • Today • {appt.status.replace('_', ' ')}</Text>
                      </View>
                   </View>
                 ))
              ) : (
                <View style={styles.emptyActivity}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>No recent activity to show.</Text>
                </View>
              )}
            </Card>
          </View>
        </CardFadeIn>
      </ScreenWrapper>
    </Animated.View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: wp(3),
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  welcomeText: {
    marginBottom: hp(0.2),
    fontWeight: '500',
  },
  nameText: {
    lineHeight: scaleFont(32),
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: scaleFont(40),
    aspectRatio: 1,
    borderRadius: scaleFont(20),
  },
  avatarRing: {
    borderWidth: 2,
    borderRadius: scaleFont(28),
    padding: 2,
  },
  pressedEffect: {
    opacity: 0.7,
  },
  cardContent: {
    padding: wp(4),
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp(1.5),
  },
  cardTitle: {
    fontWeight: '700',
  },
  liveBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: wp(1.2),
    paddingHorizontal: wp(2.4),
    paddingVertical: hp(0.6),
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: hp(1),
  },
  queueVisualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(4),
  },
  queueMetrics: {
    flex: 1,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(8),
  },
  metricIcon: {
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: scaleFont(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCaption: {
    fontWeight: '500',
  },
  metricValue: {
    fontWeight: '800',
  },
  progressSection: {},
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: scaleFont(4),
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: hp(0.5),
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  apptIconPill: {
    width: scaleFont(32),
    height: scaleFont(32),
    borderRadius: scaleFont(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontWeight: '600',
  },
  metricTextValue: {
    fontWeight: '700',
    marginTop: hp(0.6),
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: hp(2),
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: hp(0.5),
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(1),
  },
  actionIconContainer: {
    width: scaleFont(52),
    aspectRatio: 1,
    borderRadius: scaleFont(26),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(0.8),
  },
  actionLabel: {
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(1.5),
  },
  sectionTitle: {
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityCard: {
    padding: 0,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: wp(4),
  },
  activityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: wp(3),
  },
  activityContent: {
    flex: 1,
  },
  emptyActivity: {
    padding: wp(6),
    alignItems: 'center',
  },
});
