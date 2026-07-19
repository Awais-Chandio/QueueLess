import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, StyleSheet, Text, Pressable, Platform, FlatList, Image, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, Clock, MapPin, Bell, Stethoscope, ChevronRight, Star, Heart, ArrowRight, Search, Hospital } from 'lucide-react-native';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import Card from '../../components/ui/Card';
import AppButton from '../../components/ui/AppButton';
import AnimatedHeader from '../../components/ui/AnimatedHeader';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useCentersStore } from '../../store/queueStore';
import { useDashboardStats } from '../../features/home/hooks/useDashboardStats';
import { getDisplayName } from '../../utils/getDisplayName';
import { hp, scaleFont, wp } from '../../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import type { AppStackParamList } from '../../navigation/types';


type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const HomeScreen = () => {
  const { colors, spacing, typography, radius, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();

  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);
  
  const { centers, fetchCenters } = useCentersStore();
  const { refetch } = useDashboardStats();

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile, fetchProfile]);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  useEffect(() => {
    if (isFocused) {
      refetch();
    }
  }, [isFocused, refetch]);

  const displayName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good Morning';
    if (hours < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const screenFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [screenFade]);

  return (
    <Animated.View style={[styles.screen, { opacity: screenFade, backgroundColor: colors.background }]}>
      <ScreenWrapper scrollable>
        {/* Welcome Header */}
        <View style={{ marginBottom: spacing.md }}>
          <AnimatedHeader
            title={displayName}
            subtitle={`${greeting},`}
            avatarUri={profile?.avatar_url}
            location={centers[0]?.city ? `${centers[0]?.city}, Pakistan` : 'Karachi, Pakistan'}
            onPressAvatar={() => (navigation as any).navigate('Profile')}
            onPressNotifications={() => (navigation as any).navigate('Notifications')}
          />
        </View>

        {/* Search Bar */}
        <Pressable
          onPress={() => navigation.navigate('DoctorSearch')}
          style={[
            styles.searchBarContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.xl,
              padding: spacing.md,
              marginBottom: spacing.lg,
            },
          ]}
        >
          <Search size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '500' }}>
            Search doctors, clinics, specialties
          </Text>
        </Pressable>

        {/* Hero Section */}
        <View style={{ marginBottom: spacing.xl }}>
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { borderRadius: radius.xl }]}
          >
            <View style={styles.heroContent}>
              <Text style={[styles.heroTitle, { fontSize: typography.sizes.lg }]}>QueueLess Care</Text>
              <Text style={styles.heroSubtitle}>
                Skip the waiting rooms. Book slot locks, track live queue token numbers, and consult instantly.
              </Text>
            </View>
            <View style={styles.heroIllustration}>
              <Stethoscope size={scaleFont(90)} color="rgba(255, 255, 255, 0.12)" />
            </View>
          </LinearGradient>
        </View>

        {/* 4 Cards Quick Actions Grid */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.md }]}>
          Quick Services
        </Text>

        <View style={styles.grid}>
          {/* Row 1 */}
          <View style={styles.gridRow}>
            {/* Card 1: Book Appointment */}
            <Card
              onPress={() => navigation.navigate('Centers')}
              variant="gradient"
              gradientColors={isDarkMode ? ['#0A2424', '#061A1A'] : ['#E6FFFA', '#FFFFFF']}
              style={[
                styles.gridCard,
                {
                  borderColor: isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(15, 118, 110, 0.15)',
                  borderWidth: 1.5,
                  borderRadius: radius.xl,
                },
              ]}
            >
              <View style={[styles.iconWrapper, { backgroundColor: `${colors.primary}15` }]}>
                <Calendar size={scaleFont(24)} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Book Appointment</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>Find doctors and lock slots</Text>
              <ChevronRight size={16} color={colors.primary} style={styles.arrow} />
            </Card>

            {/* Card 2: My Appointments */}
            <Card
              onPress={() => (navigation as any).navigate('MyAppointments')}
              variant="gradient"
              gradientColors={isDarkMode ? ['#0D1B33', '#081326'] : ['#EEF4FF', '#FFFFFF']}
              style={[
                styles.gridCard,
                {
                  borderColor: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.12)',
                  borderWidth: 1.5,
                  borderRadius: radius.xl,
                },
              ]}
            >
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Clock size={scaleFont(24)} color="#3B82F6" />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>My Appointments</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>Track live tokens & status</Text>
              <ChevronRight size={16} color="#3B82F6" style={styles.arrow} />
            </Card>
          </View>

          <View style={{ height: spacing.md }} />

          {/* Row 2 */}
          <View style={styles.gridRow}>
            {/* Card 3: Nearby Clinics */}
            <Card
              onPress={() => navigation.navigate('Centers')}
              variant="gradient"
              gradientColors={isDarkMode ? ['#1E1B4B', '#11103A'] : ['#F5F3FF', '#FFFFFF']}
              style={[
                styles.gridCard,
                {
                  borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.12)',
                  borderWidth: 1.5,
                  borderRadius: radius.xl,
                },
              ]}
            >
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                <MapPin size={scaleFont(24)} color="#8B5CF6" />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Nearby Clinics</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>Find clinics by distance</Text>
              <ChevronRight size={16} color="#8B5CF6" style={styles.arrow} />
            </Card>

            {/* Card 4: Notifications */}
            <Card
              onPress={() => (navigation as any).navigate('Notifications')}
              variant="gradient"
              gradientColors={isDarkMode ? ['#1A1212', '#100A0A'] : ['#FFF5F5', '#FFFFFF']}
              style={[
                styles.gridCard,
                {
                  borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)',
                  borderWidth: 1.5,
                  borderRadius: radius.xl,
                },
              ]}
            >
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <Bell size={scaleFont(24)} color="#EF4444" />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Notifications</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>View queue updates & alerts</Text>
              <ChevronRight size={16} color="#EF4444" style={styles.arrow} />
            </Card>
          </View>
        </View>

        {/* Nearby Clinics Section */}
        <View style={{ marginTop: spacing.xl }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
              Nearby Clinics
            </Text>
            <Pressable onPress={() => navigation.navigate('Centers')} style={styles.seeAllButton}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
              <ArrowRight size={14} color={colors.primary} />
            </Pressable>
          </View>

          {centers.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginLeft: spacing.sm }}>No clinics currently configured.</Text>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={centers.slice(0, 4)}
              keyExtractor={(item) => `nearby-${item.id}`}
              contentContainerStyle={{ paddingVertical: spacing.xs, gap: spacing.md }}
              renderItem={({ item, index }) => {
                const distance = (1.2 + (index % 4) * 0.5).toFixed(1);
                const rating = (4.6 + (index % 3) * 0.1).toFixed(1);
                return (
                  <View
                    style={[
                      styles.clinicCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.xl,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={[styles.clinicImage, { borderRadius: radius.lg }]} />
                    ) : (
                      <View style={[styles.clinicImagePlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.lg }]}>
                        <Hospital size={36} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginTop: spacing.sm }}>
                      <Text style={[styles.clinicNameText, { color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800' }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 4 }}>
                        <Star size={11} color="#FBBF24" fill="#FBBF24" />
                        <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.text, fontWeight: '800' }}>{rating}</Text>
                        <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.textSecondary }} numberOfLines={1}>• {item.address || item.city}</Text>
                      </View>
                      <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.textSecondary, marginBottom: spacing.md }}>
                        {item.open_time && item.close_time ? `${item.open_time} - ${item.close_time}` : '09:00 AM - 05:00 PM'}
                      </Text>
                      <AppButton
                        title="View Clinic"
                        onPress={() => navigation.navigate('CenterDetails', { centerId: item.id })}
                        style={{ paddingVertical: 6, minHeight: 32 }}
                        textStyle={{ fontSize: 12 }}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Popular Clinics Section */}
        <View style={{ marginTop: spacing.xl, marginBottom: spacing.lg }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
              Popular Clinics
            </Text>
            <Pressable onPress={() => navigation.navigate('Centers')} style={styles.seeAllButton}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
              <ArrowRight size={14} color={colors.primary} />
            </Pressable>
          </View>

          {centers.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginLeft: spacing.sm }}>No clinics currently configured.</Text>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={centers.slice(2, 6).concat(centers.slice(0, 2))}
              keyExtractor={(item) => `pop-${item.id}`}
              contentContainerStyle={{ paddingVertical: spacing.xs, gap: spacing.md }}
              renderItem={({ item, index }) => {
                const rating = (4.7 + (index % 3) * 0.1).toFixed(1);
                return (
                  <View
                    style={[
                      styles.clinicCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.xl,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={[styles.clinicImage, { borderRadius: radius.lg }]} />
                    ) : (
                      <View style={[styles.clinicImagePlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.lg }]}>
                        <Hospital size={36} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginTop: spacing.sm }}>
                      <Text style={[styles.clinicNameText, { color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800' }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 4 }}>
                        <Star size={11} color="#FBBF24" fill="#FBBF24" />
                        <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.text, fontWeight: '800' }}>{rating}</Text>
                        <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.textSecondary }}>• {item.category || 'OPD'}</Text>
                      </View>
                      <Text style={{ fontSize: typography.sizes.xs - 1, color: colors.textSecondary, marginBottom: spacing.md }}>
                        {item.open_time && item.close_time ? `${item.open_time} - ${item.close_time}` : '09:00 AM - 05:00 PM'}
                      </Text>
                      <AppButton
                        title="View Clinic"
                        onPress={() => navigation.navigate('CenterDetails', { centerId: item.id })}
                        style={{ paddingVertical: 6, minHeight: 32 }}
                        textStyle={{ fontSize: 12 }}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>

        <View style={{ height: hp(10) }} />
      </ScreenWrapper>
    </Animated.View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  heroCard: {
    padding: wp(5),
    position: 'relative',
    overflow: 'hidden',
  },
  heroContent: {
    zIndex: 2,
    maxWidth: '80%',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    lineHeight: 18,
  },
  heroIllustration: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 0.8,
  },
  sectionTitle: {
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  grid: {
    width: '100%',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  gridCard: {
    flex: 1,
    padding: wp(4.5),
    minHeight: hp(18),
    justifyContent: 'flex-start',
    position: 'relative',
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  arrow: {
    position: 'absolute',
    bottom: wp(4.5),
    right: wp(4.5),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '800',
  },
  loadingContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clinicCard: {
    width: wp(64),
    borderWidth: 1.2,
  },
  clinicImage: {
    width: '100%',
    height: hp(12),
  },
  clinicImagePlaceholder: {
    width: '100%',
    height: hp(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicNameText: {
    fontWeight: '800',
  },
  divider: {
    height: 1,
  },
  docHorizontalCard: {
    width: wp(64),
    borderWidth: 1.2,
    flexDirection: 'column',
  },
  docAvatar: {
    width: 64,
    height: 76,
  },
  docAvatarPlaceholder: {
    width: 64,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  docNameText: {
    fontSize: 13,
    fontWeight: '900',
  },
  docSpecialtyText: {
    fontSize: 11,
    fontWeight: '800',
  },
  docRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  docRatingText: {
    fontSize: 10,
    fontWeight: '800',
  },
  docExpText: {
    fontSize: 10,
    fontWeight: '600',
  },
  docClinicText: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 4,
  },
  docFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  docFeeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  docNextSlot: {
    fontSize: 9,
    fontWeight: '800',
  },
  centerHorizontalCard: {
    width: wp(64),
    borderWidth: 1.2,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  centerIconWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerNameText: {
    fontSize: 12,
    fontWeight: '800',
  },
  centerCategoryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  centerCityText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
});
