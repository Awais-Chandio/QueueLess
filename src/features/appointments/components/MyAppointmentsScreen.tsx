import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { StatusChip } from '../../../components/ui/StatusChip';
import { SkeletonLoader } from '../../../components/animations/SkeletonLoader';
import AnimatedCard from '../../../components/ui/AnimatedCard';
import { useTheme } from '../../../hooks/useTheme';
import { useAppointments } from '../hooks/useAppointments';
import { useAuthStore } from '../../../store/authStore';
import type { AppStackParamList } from '../../../navigation/types';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../../services/bookingService';
import { Calendar, Clock, MapPin, SearchX, Hash, Stethoscope, Heart, Smile } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';
import {
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
} from '../utils/appointmentTime';

const getServiceIcon = (serviceName: string) => {
  const name = (serviceName || '').toLowerCase();
  if (name.includes('pediatric')) return { icon: Smile, color: '#0891B2' };
  if (name.includes('cardio') || name.includes('heart')) return { icon: Heart, color: '#EF4444' };
  if (name.includes('dental') || name.includes('teeth')) return { icon: Hash, color: '#F59E0B' };
  return { icon: Stethoscope, color: '#0E7490' };
};

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'all' | 'upcoming' | 'active' | 'completed' | 'cancelled';

const statusFilters = [
  { key: 'all' as const, label: 'All', dotColor: '#0E7490' },
  { key: 'upcoming' as const, label: 'Upcoming', dotColor: '#F59E0B' },
  { key: 'active' as const, label: 'Active', dotColor: '#3B82F6' },
  { key: 'completed' as const, label: 'Completed', dotColor: '#0E7490' },
  { key: 'cancelled' as const, label: 'Cancelled', dotColor: '#EF4444' },
];

const MyAppointmentsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();
  const userId = useAuthStore(state => state.user?.id);
  const {
    data: appointments = [],
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useAppointments();
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        refetch();
      }
    }, [refetch, userId]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const filteredAppointments = appointments.filter(item => {
    const { resolvedStatus } = getAppointmentStatusState(item);
    if (selectedStatus === 'all') return true;
    if (selectedStatus === 'upcoming') {
      return resolvedStatus === 'pending' || resolvedStatus === 'confirmed';
    }
    if (selectedStatus === 'active') {
      return resolvedStatus === 'checked_in' || resolvedStatus === 'called' || resolvedStatus === 'in_progress';
    }
    if (selectedStatus === 'completed') {
      return resolvedStatus === 'completed';
    }
    if (selectedStatus === 'cancelled') {
      return resolvedStatus === 'cancelled' || resolvedStatus === 'expired' || resolvedStatus === 'no_show';
    }
    return false;
  });

  const renderSkeleton = () => (
    <View style={{ paddingBottom: spacing.xl }}>
      <SkeletonLoader height={140} count={3} gap={spacing.md} />
    </View>
  );

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
          My Appointments
        </Text>

        {/* Status filter chips with dot indicators */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: scaleFont(44), marginBottom: spacing.md }}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          {statusFilters.map(filter => {
            const isSelected = selectedStatus === filter.key;
            const dotColor = filter.dotColor;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setSelectedStatus(filter.key)}
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    borderColor: isSelected ? dotColor : colors.border,
                    backgroundColor: isSelected ? dotColor + '18' : colors.surface,
                    borderRadius: radius.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: scaleFont(5),
                    height: scaleFont(30),
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View
                  style={{
                    width: scaleFont(6),
                    height: scaleFont(6),
                    borderRadius: scaleFont(3),
                    backgroundColor: isSelected ? dotColor : colors.textSecondary + '60',
                  }}
                />
                <Text style={{
                  color: isSelected ? dotColor : colors.textSecondary,
                  fontSize: typography.sizes.sm,
                  fontWeight: isSelected ? '700' : '500',
                }}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isError ? (
          <ErrorState
            title="Failed To Load Appointments"
            message={
              error instanceof Error
                ? error.message
                : 'Please try again.'
            }
            buttonTitle="Retry"
            onRetry={handleRefresh}
          />
        ) : isLoading && appointments.length === 0 ? (
          renderSkeleton()
        ) : (
          <FlatList
            data={filteredAppointments}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            contentContainerStyle={{ paddingBottom: spacing.xl, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                tintColor={colors.primary}
                refreshing={isRefreshing || isRefetching}
                onRefresh={handleRefresh}
              />
            }
            ListEmptyComponent={
              <EmptyState
                Icon={SearchX}
                title="No Appointments"
                subtitle="No appointments found for this status."
              />
            }
            renderItem={({ item, index }) => {
              const { resolvedStatus, isExpired, isNoShow } = getAppointmentStatusState(item);
              const { label: statusLabel } = getStatusDisplayProperties(resolvedStatus);

              const serviceIconInfo = getServiceIcon(item.service_name ?? '');

              return (
                <AnimatedCard delay={Math.min(index * 60, 300)}>
                  <Card
                    onPress={() =>
                      navigation.navigate('AppointmentDetails', {
                        appointmentId: item.id,
                      })
                    }
                    style={{ padding: spacing.md, borderRadius: 20 }}
                    containerStyle={{ marginBottom: spacing.md }}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.serviceIconWrapper, { backgroundColor: serviceIconInfo.color + '12' }]}>
                        <serviceIconInfo.icon size={18} color={serviceIconInfo.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
                          {item.service_name ?? 'Service'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs / 2 }}>
                          <MapPin size={scaleFont(12)} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginLeft: spacing.xs, flex: 1 }} numberOfLines={1}>
                            {item.center_name ?? 'Center'}
                          </Text>
                        </View>
                      </View>
                      <StatusChip
                        status={resolvedStatus}
                        label={statusLabel}
                        size="sm"
                      />
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border + '40', marginVertical: spacing.md }]} />

                    <View style={styles.detailsRow}>
                      <View style={styles.detailBlock}>
                        <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
                          <Calendar size={12} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={styles.detailLabel}>Date</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>{getAppointmentDateLabel(item)}</Text>
                        </View>
                      </View>

                      <View style={styles.detailBlock}>
                        <View style={[styles.detailIconPill, { backgroundColor: `${colors.info}10` }]}>
                          <Clock size={12} color={colors.info} />
                        </View>
                        <View>
                          <Text style={styles.detailLabel}>Time</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>{getAppointmentTimeLabel(item)}</Text>
                        </View>
                      </View>

                      {typeof item.token_number === 'number' && (
                        <View style={styles.detailBlock}>
                          <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
                            <Hash size={12} color={colors.primary} />
                          </View>
                          <View>
                            <Text style={styles.detailLabel}>Token</Text>
                            <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '800' }]}>#{item.token_number}</Text>
                          </View>
                        </View>
                      )}
                    </View>

                    {['pending', 'confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedStatus) && !isExpired && !isNoShow && (
                      <AppButton
                        title="View Live Queue"
                        variant="outline"
                        onPress={() =>
                          navigation.navigate('QueueStatus', {
                            appointmentId: item.id,
                          })
                        }
                        style={{ marginTop: spacing.md }}
                      />
                    )}
                  </Card>
                </AnimatedCard>
              );
            }}
          />
        )}
      </View>
    </ScreenWrapper>
  );
};

export default MyAppointmentsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  filterButton: {
    borderWidth: 1.2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: scaleFont(10),
  },
  serviceIconWrapper: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: scaleFont(8),
  },
  detailBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(6),
    minWidth: '28%',
  },
  detailIconPill: {
    width: scaleFont(26),
    height: scaleFont(26),
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
});
