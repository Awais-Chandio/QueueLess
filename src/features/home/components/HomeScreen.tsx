import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import AppButton from '../../../components/ui/AppButton';
import SectionHeader from '../../../components/ui/SectionHeader';
import IconButton from '../../../components/ui/IconButton';
import AnimatedHeader from '../../../components/ui/AnimatedHeader';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../../navigation/types';
import {
  Bell,
  Calendar,
  Clock,
  Users,
  Hash,
  Activity,
  ChevronRight,
  MapPin,
  Heart,
  Plus,
  ShieldCheck,
  Stethoscope,
  Smile,
  Droplet,
  Wind,
  Moon,
  Sparkles,
} from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useProfileStore } from '../../../store/profileStore';
import { useCentersStore } from '../../../store/centersStore';
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
import LinearGradient from 'react-native-linear-gradient';
import ReAnimated, { FadeInDown } from 'react-native-reanimated';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const FEATURED_SERVICES = [
  { id: '1', name: 'General Consultation', description: 'Routine checkups & wellness', icon: Stethoscope, color: '#0F766E' },
  { id: '2', name: 'Pediatrics Care', description: 'Child growth & immunizations', icon: Smile, color: '#22C55E' },
  { id: '3', name: 'Cardiology Center', description: 'Heart diagnostics & therapy', icon: Heart, color: '#EF4444' },
  { id: '4', name: 'Dental Diagnostics', description: 'Teeth cleaning & checks', icon: Hash, color: '#F59E0B' },
];

const HEALTH_TIPS = [
  { id: '1', title: 'Stay Hydrated', text: 'Drink at least 8-10 glasses of water daily to maintain energy levels and kidney function.', icon: Droplet, color: '#06B6D4' },
  { id: '2', title: 'Mindful Breathing', text: 'Take 5 deep breaths during stressful moments to regulate heart rate and calm your mind.', icon: Wind, color: '#10B981' },
  { id: '3', title: 'Sleep Hygiene', text: 'Aim for 7-9 hours of quality sleep to boost immune system responses and memory recall.', icon: Moon, color: '#6366F1' },
  { id: '4', title: 'Active Desk Breaks', text: 'Stand up and stretch for 2 minutes every hour you spend working at a desk.', icon: Sparkles, color: '#F59E0B' },
];

const HomeScreen = () => {
  const { colors, spacing, typography, radius, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();

  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats();
  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  const isProfileLoading = useProfileStore(state => state.isLoading);
  const profileId = profile?.id;

  const { centers, fetchCenters, loading: centersLoading } = useCentersStore();

  useEffect(() => {
    if (user?.id && profileId !== user.id) {
      fetchProfile(user.id);
    }
  }, [user?.id, profileId, fetchProfile]);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  const displayName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good Morning';
    if (hours < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

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
  } = useRealtimeQueue(
    activeToken,
    refetch,
    {
      centerId: activeAppointment?.centerId,
      scheduledAt: activeAppointment?.scheduledAt,
    },
    true,
  );

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

  // Refresh home data when screen gains focus
  useEffect(() => {
    if (isFocused) {
      refetch();
    }
  }, [isFocused, refetch]);

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

  const refreshHome = useCallback(async () => {
    await Promise.all([
      refetch(),
      user?.id ? fetchProfile(user.id) : Promise.resolve(),
      fetchCenters(),
    ]);
  }, [fetchProfile, refetch, user?.id, fetchCenters]);

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

  const showComingSoonAlert = () => {
    Alert.alert(
      "Feature Coming Soon",
      "Medical History is a premium feature that will be available in the upcoming QueueLess Pro update. Stay tuned!",
      [{ text: "OK", style: "default" }]
    );
  };

  return (
    <Animated.View style={[styles.screen, { opacity: screenFade, backgroundColor: colors.background }]}>
      <ScreenWrapper
        scrollable
        onRefresh={refreshHome}
        refreshing={isRefetching || isProfileLoading || centersLoading}
      >
        {/* A. Welcome Header */}
        <CardFadeIn delay={0}>
          <AnimatedHeader
            title={displayName}
            subtitle={`${greeting},`}
            avatarUri={profile?.avatar_url}
            location={centers[0]?.city ? `${centers[0]?.city}, Pakistan` : 'Karachi, Pakistan'}
            onPressAvatar={() => (navigation as any).navigate('Profile')}
            onPressNotifications={() => (navigation as any).navigate('Notifications')}
          />
        </CardFadeIn>

        {/* B. Health Hero Banner */}
        <ReAnimated.View entering={FadeInDown.delay(100).duration(400)} style={{ marginBottom: spacing.lg }}>
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.healthBanner, { borderRadius: 20 }]}
          >
            <View style={styles.bannerContainer}>
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>Need a Consultation Today?</Text>
                <Text style={styles.bannerSubtitle}>Skip the waiting room. Book your virtual or physical slot instantly.</Text>
                <AppButton
                  title="Book a Consultation"
                  onPress={() => (navigation as any).navigate('Centers')}
                  variant="secondary"
                  style={{ backgroundColor: '#FFFFFF', borderWidth: 0 }}
                  textStyle={{ color: colors.primary, fontSize: typography.sizes.sm }}
                  rightIcon={<Plus size={14} color={colors.primary} />}
                  containerStyle={{ width: 'auto', alignSelf: 'flex-start', marginTop: spacing.xs }}
                />
              </View>
              <View style={styles.bannerIllustration}>
                <Stethoscope size={scaleFont(96)} color="rgba(255, 255, 255, 0.15)" style={styles.illIcon} />
              </View>
            </View>
          </LinearGradient>
        </ReAnimated.View>

        {/* C. Quick Actions Grid */}
        <ReAnimated.View entering={FadeInDown.delay(150).duration(400)} style={{ marginBottom: spacing.lg }}>
          <SectionHeader title="Quick Actions" />
          <View style={styles.actionsGrid}>
            <View style={styles.actionsGridRow}>
              <Card
                onPress={() => (navigation as any).navigate('Centers')}
                variant="gradient"
                gradientColors={isDarkMode ? ['rgba(15, 118, 110, 0.20)', '#0B2424'] : ['#F0FDFA', '#FFFFFF']}
                style={[styles.gridActionCard, { borderColor: isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(15, 118, 110, 0.15)', borderWidth: 1 }]}
              >
                <View style={[styles.gridActionIconWrapper, { backgroundColor: `${colors.primary}12` }]}>
                  <Calendar size={scaleFont(22)} color={colors.primary} />
                </View>
                <Text style={[styles.gridActionTitle, { color: colors.text }]}>Book Slot</Text>
                <Text style={[styles.gridActionSubtitle, { color: colors.textSecondary }]}>Find nearby clinics</Text>
              </Card>

              <View style={{ width: spacing.md }} />

              <Card
                onPress={() => (navigation as any).navigate('MyAppointments')}
                variant="gradient"
                gradientColors={isDarkMode ? ['rgba(20, 184, 166, 0.18)', '#0B2424'] : ['#ECFDF5', '#FFFFFF']}
                style={[styles.gridActionCard, { borderColor: isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(16, 185, 129, 0.15)', borderWidth: 1 }]}
              >
                <View style={[styles.gridActionIconWrapper, { backgroundColor: `${colors.info}12` }]}>
                  <Clock size={scaleFont(22)} color={colors.info} />
                </View>
                <Text style={[styles.gridActionTitle, { color: colors.text }]}>My Visits</Text>
                <Text style={[styles.gridActionSubtitle, { color: colors.textSecondary }]}>Manage your queue</Text>
              </Card>
            </View>

            <View style={{ height: spacing.md }} />

            <View style={styles.actionsGridRow}>
              <Card
                disabled={!activeAppointment || activeToken == null || !hasActiveQueueAppt}
                onPress={() => activeAppointment && navigation.navigate('QueueStatus', { appointmentId: activeAppointment.id })}
                variant="gradient"
                gradientColors={isDarkMode ? ['rgba(16, 185, 129, 0.15)', '#0D1B33'] : ['#DCFCE7', '#FFFFFF']}
                style={[
                  styles.gridActionCard,
                  { borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)', borderWidth: 1 },
                  (!activeAppointment || activeToken == null || !hasActiveQueueAppt) && { opacity: 0.5 }
                ]}
              >
                <View style={[styles.gridActionIconWrapper, { backgroundColor: `${colors.success}12` }]}>
                  <Activity size={scaleFont(22)} color={colors.success} />
                </View>
                <Text style={[styles.gridActionTitle, { color: colors.text }]}>Live Queue</Text>
                <Text style={[styles.gridActionSubtitle, { color: colors.textSecondary }]}>Track current token</Text>
              </Card>

              <View style={{ width: spacing.md }} />

              <Card
                onPress={showComingSoonAlert}
                variant="gradient"
                gradientColors={isDarkMode ? ['rgba(245, 158, 11, 0.15)', '#0D1B33'] : ['#FEF3C7', '#FFFFFF']}
                style={[styles.gridActionCard, { borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)', borderWidth: 1 }]}
              >
                <View style={[styles.gridActionIconWrapper, { backgroundColor: `${colors.warning}12` }]}>
                  <ShieldCheck size={scaleFont(22)} color={colors.warning} />
                </View>
                <Text style={[styles.gridActionTitle, { color: colors.text }]}>Health History</Text>
                <Text style={[styles.gridActionSubtitle, { color: colors.textSecondary }]}>Lab reports & files</Text>
              </Card>
            </View>
          </View>
        </ReAnimated.View>

        {/* D. Current Queue Ticket / Hero Status Card */}
        <CardFadeIn delay={200}>
          <View style={{ marginBottom: spacing.lg }}>
            <SectionHeader title="Current Queue Ticket" />

            {isLoading || queueLoading ? (
              <Card variant="elevated" style={styles.ticketCardLoading}>
                <Skeleton height={24} width="60%" borderRadius={radius.md} style={{ marginBottom: 12 }} />
                <Skeleton height={50} width="100%" borderRadius={radius.md} />
              </Card>
            ) : activeAppointment ? (
              <Card
                onPress={() => navigation.navigate('AppointmentDetails', { appointmentId: activeAppointment.id })}
                variant="gradient"
                gradientColors={isDarkMode ? ['#111A2E', '#0D1B33'] : ['#EEF4FF', '#FFFFFF']}
                style={[styles.ticketCard, { borderColor: isDarkMode ? 'rgba(20, 184, 166, 0.22)' : 'rgba(15, 118, 110, 0.15)', borderWidth: 1 }]}
              >
                {/* Header info */}
                <View style={styles.ticketCardHeader}>
                  <View style={styles.ticketLogoContainer}>
                    <View style={[styles.ticketLogoCircle, { backgroundColor: colors.primary + '12' }]}>
                      <Stethoscope size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ticketServiceName, { color: colors.text, fontSize: typography.sizes.md }]}>
                        {activeAppointment.serviceName}
                      </Text>
                      <Text style={[styles.ticketCenterName, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                        {activeAppointment.centerName}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <StatusChip
                      status={resolvedActiveApptStatus || activeAppointment.status as any}
                      label={statusProps.label}
                      size="sm"
                    />
                  </View>
                </View>

                {/* Dotted separator line */}
                <View style={[styles.ticketDottedLine, { borderColor: colors.border + '50' }]} />

                {/* Ticket Details Row */}
                <View style={styles.ticketMetricsRow}>
                  <View style={styles.ticketMetric}>
                    <Calendar size={14} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.ticketMetricLabel, { color: colors.textSecondary }]}>Date</Text>
                    <Text style={[styles.ticketMetricValue, { color: colors.text }]}>{nextApptDate}</Text>
                  </View>

                  <View style={styles.ticketMetric}>
                    <Clock size={14} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.ticketMetricLabel, { color: colors.textSecondary }]}>Time</Text>
                    <Text style={[styles.ticketMetricValue, { color: colors.text }]}>{nextApptTime}</Text>
                  </View>

                  <View style={styles.ticketMetric}>
                    <Hash size={14} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.ticketMetricLabel, { color: colors.textSecondary }]}>Token</Text>
                    <Text style={[styles.ticketMetricValue, { color: colors.primary, fontWeight: '800' }]}>
                      #{activeToken ?? '--'}
                    </Text>
                  </View>
                </View>

                {/* Serving Progress Bar (Only if active in queue) */}
                {hasActiveQueueAppt && activeToken != null && (
                  <View style={[styles.ticketProgressSection, { borderTopColor: colors.border + '30', borderTopWidth: 1 }]}>
                    <View style={styles.ticketProgressLabels}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Animated.View style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: colors.success,
                          opacity: livePulse,
                        }} />
                        <Text style={[styles.progressServingText, { color: colors.textSecondary }]}>
                          Now Serving #{currentToken}
                        </Text>
                      </View>
                      <Text style={[styles.progressYourTokenText, { color: colors.primary }]}>
                        Your Slot #{activeToken}
                      </Text>
                    </View>
                    <ProgressBar progress={queueProgress} color={colors.primary} height={6} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs }}>
                      <Users size={12} color={colors.warning} />
                      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                        {peopleAhead === 0 ? 'You are next in line! Head to your counter.' : `${peopleAhead} people ahead of you.`}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            ) : (
              /* Illustration empty state card */
              <Card variant="elevated" style={[styles.emptyTicketCard, { borderColor: colors.border + '30', borderWidth: 1 }]}>
                <View style={[styles.emptyIllustrationWrapper, { backgroundColor: colors.primary + '12' }]}>
                  <Calendar size={scaleFont(24)} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTicketTitle, { color: colors.text }]}>No Upcoming Bookings</Text>
                <Text style={[styles.emptyTicketSubtitle, { color: colors.textSecondary }]}>
                  You don't have any active clinic queues booked. Schedule a slot below.
                </Text>
                <Pressable
                  onPress={() => (navigation as any).navigate('Centers')}
                  style={({ pressed }) => [
                    styles.emptyTicketBtn,
                    { backgroundColor: colors.primary, borderRadius: radius.xl },
                    pressed && { opacity: 0.95 }
                  ]}
                >
                  <Text style={styles.emptyTicketBtnText}>Schedule Visit</Text>
                  <Plus size={14} color="#FFF" />
                </Pressable>
              </Card>
            )}
          </View>
        </CardFadeIn>

        {/* F. Featured Medical Services */}
        <ReAnimated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginBottom: spacing.lg }}>
          <SectionHeader title="Featured Services" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.servicesScrollContainer}
          >
            {FEATURED_SERVICES.map(service => (
              <Card
                key={service.id}
                onPress={() => (navigation as any).navigate('Centers')}
                style={[styles.serviceScrollCard, { borderColor: colors.border + '20', borderWidth: 1 }]}
              >
                <View style={[styles.serviceCardIconCircle, { backgroundColor: service.color + '12' }]}>
                  <service.icon size={20} color={service.color} />
                </View>
                <Text style={[styles.serviceCardTitle, { color: colors.text }]} numberOfLines={1}>{service.name}</Text>
                <Text style={[styles.serviceCardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{service.description}</Text>
                <View style={styles.serviceCardArrowRow}>
                  <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>Book Now</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </View>
              </Card>
            ))}
          </ScrollView>
        </ReAnimated.View>

        {/* Daily Health Tips */}
        <ReAnimated.View entering={FadeInDown.delay(320).duration(400)} style={{ marginBottom: spacing.lg }}>
          <SectionHeader title="Daily Health Tips" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tipsScrollContainer}
          >
            {HEALTH_TIPS.map(tip => (
              <Card
                key={tip.id}
                style={[styles.tipScrollCard, { borderColor: colors.border + '20', borderWidth: 1 }]}
              >
                <View style={styles.tipCardHeader}>
                  <View style={[styles.tipIconCircle, { backgroundColor: tip.color + '12' }]}>
                    <tip.icon size={18} color={tip.color} />
                  </View>
                  <Text style={[styles.tipTitle, { color: colors.text }]}>{tip.title}</Text>
                </View>
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>{tip.text}</Text>
              </Card>
            ))}
          </ScrollView>
        </ReAnimated.View>

        {/* G. Nearby Service Centers */}
        <ReAnimated.View entering={FadeInDown.delay(350).duration(400)} style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Nearby Clinics" onPressAction={() => (navigation as any).navigate('Centers')} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.centersScrollContainer}
          >
            {centers.length ? (
              centers.map(center => (
                <Card
                  key={center.id}
                  onPress={() => navigation.navigate('CenterDetails', { centerId: center.id })}
                  style={[styles.centerScrollCard, { borderColor: colors.border + '20', borderWidth: 1 }]}
                >
                  <View style={[styles.centerCardImagePlaceholder, { backgroundColor: colors.primary + '08' }]}>
                    <MapPin size={32} color={colors.primary} />
                    <View style={[styles.centerOpenBadge, { backgroundColor: colors.success + '15' }]}>
                      <Text style={[styles.centerOpenBadgeText, { color: colors.success }]}>Open</Text>
                    </View>
                  </View>
                  <View style={styles.centerCardInfo}>
                    <Text style={[styles.centerCardName, { color: colors.text }]} numberOfLines={1}>
                      {center.name}
                    </Text>
                    <Text style={[styles.centerCardAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                      {center.address}
                    </Text>

                    <View style={styles.centerCardStatsRow}>
                      <View style={styles.centerCardStat}>
                        <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 11 }}>★ 4.8</Text>
                      </View>
                      <View style={[styles.centerCardStatDot, { backgroundColor: colors.border }]} />
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>1.2 km</Text>
                    </View>
                  </View>
                </Card>
              ))
            ) : (
            <Card style={styles.emptyCentersScroll}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>No clinics found.</Text>
              </Card>
            )}
          </ScrollView>
        </ReAnimated.View>

        {/* E. Recent Activity */}
        <CardFadeIn delay={400}>
          <View style={{ marginBottom: spacing.xl }}>
            <SectionHeader title="Recent Activity" onPressAction={() => (navigation as any).navigate('MyAppointments')} />
            <Card variant="elevated" style={styles.activityCard}>
              {stats?.todayAppointments?.length ? (
                stats.todayAppointments.slice(0, 3).map((appt: any, index: number) => (
                  <Pressable
                    key={appt.id}
                    onPress={() => navigation.navigate('AppointmentDetails', { appointmentId: appt.id })}
                    style={({ pressed }) => [
                      styles.activityItem,
                      index !== 0 && { borderTopWidth: 1, borderTopColor: colors.border + '50' },
                      pressed && { backgroundColor: colors.border + '20' }
                    ]}
                  >
                    <View style={[styles.activityIconContainer, { backgroundColor: `${colors.primary}10` }]}>
                      <Activity size={18} color={colors.primary} />
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: typography.sizes.sm }}>{appt.serviceName || 'Clinic Appointment'}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{appt.centerName || 'QueueLess Center'} • {appt.dateLabel} • {appt.status.replace('_', ' ')}</Text>
                    </View>
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyActivity}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>No recent activity to show.</Text>
                </View>
              )}
            </Card>
          </View>
        </CardFadeIn>

        {/* Space at bottom */}
        <View style={{ height: hp(12) }} />
      </ScreenWrapper>
    </Animated.View>
  );
};



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
    marginBottom: hp(0.1),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  nameText: {
    lineHeight: scaleFont(32),
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
    gap: 4,
  },
  locationText: {
    fontWeight: '700',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: scaleFont(40),
    aspectRatio: 1,
  },
  avatarRing: {
    borderWidth: 2,
    borderRadius: 999,
    padding: 2,
  },
  pressedEffect: {
    opacity: 0.7,
  },
  healthBanner: {
    padding: wp(5),
    overflow: 'hidden',
  },
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerContent: {
    flex: 1.3,
    zIndex: 2,
  },
  bannerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 6,
  },
  bannerSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 14,
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  bannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bannerIllustration: {
    position: 'absolute',
    right: -20,
    bottom: -30,
    zIndex: 1,
  },
  illIcon: {
    transform: [{ rotate: '-15deg' }],
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  actionsGrid: {
    width: '100%',
  },
  actionsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridActionCard: {
    flex: 1,
    padding: wp(4.5),
    alignItems: 'flex-start',
    borderRadius: 20,
  },
  gridActionIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  gridActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  gridActionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  statsGrid: {
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    padding: wp(4),
    alignItems: 'flex-start',
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  ticketCard: {
    padding: wp(5),
    borderRadius: 20,
  },
  ticketCardLoading: {
    padding: wp(5),
    alignItems: 'flex-start',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  ticketLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  ticketLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketServiceName: {
    fontWeight: '800',
  },
  ticketCenterName: {
    marginTop: 2,
  },
  ticketDottedLine: {
    borderWidth: 1,
    borderStyle: 'dashed',
    height: 0,
    width: '100%',
    marginVertical: hp(1.8),
  },
  ticketMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketMetric: {
    flex: 1,
    alignItems: 'center',
  },
  ticketMetricLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  ticketMetricValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  ticketProgressSection: {
    marginTop: hp(1.8),
    paddingTop: hp(1.5),
  },
  ticketProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressServingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressYourTokenText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTicketCard: {
    padding: wp(6),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  emptyIllustrationWrapper: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTicketTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyTicketSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: wp(3),
    marginBottom: 16,
  },
  emptyTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  emptyTicketBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  servicesScrollContainer: {
    paddingRight: wp(6),
    gap: 12,
  },
  tipsScrollContainer: {
    paddingRight: wp(6),
    gap: 12,
  },
  tipScrollCard: {
    width: wp(64),
    padding: wp(4),
    borderRadius: 20,
  },
  tipCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  tipIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  tipText: {
    fontSize: 11,
    lineHeight: 16,
  },
  serviceScrollCard: {
    width: wp(42),
    padding: wp(4),
    alignItems: 'flex-start',
    borderRadius: 20,
  },
  serviceCardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  serviceCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  serviceCardDesc: {
    fontSize: 11,
    lineHeight: 15,
    height: 30,
    overflow: 'hidden',
    marginBottom: 12,
  },
  serviceCardArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(1.5),
    paddingHorizontal: wp(1),
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centersScrollContainer: {
    paddingRight: wp(6),
    gap: 12,
  },
  centerScrollCard: {
    width: wp(54),
    padding: wp(3.5),
    borderRadius: 20,
  },
  centerCardImagePlaceholder: {
    width: '100%',
    height: hp(11),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  centerOpenBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  centerOpenBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  centerCardInfo: {
    marginTop: 10,
  },
  centerCardName: {
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 2,
  },
  centerCardAddr: {
    fontSize: 11,
    marginBottom: 6,
  },
  centerCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  centerCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerCardStatDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  emptyCentersScroll: {
    padding: wp(6),
    width: wp(80),
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCard: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: wp(4),
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 999,
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

export default HomeScreen;
