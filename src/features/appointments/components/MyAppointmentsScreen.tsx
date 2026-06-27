import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
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
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useTheme } from '../../../hooks/useTheme';
import { useAppointments } from '../hooks/useAppointments';
import { useAuthStore } from '../../../store/authStore';
import type { AppStackParamList } from '../../../navigation/types';
import type { AppointmentStatus } from '../../../types/appointment';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../../services/bookingService';
import { Calendar, Clock, MapPin, SearchX, Hash } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';
import {
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
} from '../utils/appointmentTime';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'all' | AppointmentStatus;

const statusFilters: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'checked_in',
  'called',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'no_show',
];

const STATUS_DOT_COLORS: Record<string, string> = {
  all: '#2E7DFF',
  pending: '#F59E0B',
  confirmed: '#2E7DFF',
  checked_in: '#3B82F6',
  called: '#8B5CF6',
  in_progress: '#8B5CF6',
  completed: '#22C55E',
  cancelled: '#EF4444',
  expired: '#EF4444',
  no_show: '#EF4444',
};

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
    return selectedStatus === 'all' || resolvedStatus === selectedStatus;
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
        <View style={[styles.filterRow, { marginBottom: spacing.md, gap: spacing.sm }]}>
          {statusFilters.map(status => {
            const isSelected = selectedStatus === status;
            const { label: statusLabel } = getStatusDisplayProperties(status as any);
            const dotColor = STATUS_DOT_COLORS[status] ?? colors.textSecondary;
            return (
              <Pressable
                key={status}
                onPress={() => setSelectedStatus(status)}
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
                  {status === 'all' ? 'All' : statusLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

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

              return (
                <CardFadeIn delay={Math.min(index * 60, 300)}>
                  <Card style={{ marginBottom: spacing.md }}>
                    <Pressable
                      onPress={() =>
                        navigation.navigate('AppointmentDetails', {
                          appointmentId: item.id,
                        })
                      }
                      style={({ pressed }) => pressed ? { opacity: 0.85 } : {}}
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '700' }}>
                            {item.service_name ?? 'Service'}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
                            <MapPin size={scaleFont(13)} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: spacing.xs, flex: 1 }}>
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

                      <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

                      <View style={styles.detailsRow}>
                        <View style={styles.detailItem}>
                          <View style={[styles.detailIconRow, { marginBottom: spacing.xs / 2 }]}>
                            <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}12` }]}>
                              <Calendar size={scaleFont(12)} color={colors.primary} />
                            </View>
                            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Date</Text>
                          </View>
                          <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                            {getAppointmentDateLabel(item)}
                          </Text>
                        </View>

                        <View style={styles.detailItem}>
                          <View style={[styles.detailIconRow, { marginBottom: spacing.xs / 2 }]}>
                            <View style={[styles.detailIconPill, { backgroundColor: `${colors.info}12` }]}>
                              <Clock size={scaleFont(12)} color={colors.info} />
                            </View>
                            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Time</Text>
                          </View>
                          <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                            {getAppointmentTimeLabel(item)}
                          </Text>
                        </View>

                        {typeof item.token_number === 'number' && (
                          <View style={styles.detailItem}>
                            <View style={[styles.detailIconRow, { marginBottom: spacing.xs / 2 }]}>
                              <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}12` }]}>
                                <Hash size={scaleFont(12)} color={colors.primary} />
                              </View>
                              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Token</Text>
                            </View>
                            <Text style={{ color: colors.primary, fontSize: typography.sizes.sm, fontWeight: 'bold' }}>
                              #{item.token_number}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>

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
                </CardFadeIn>
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
    fontWeight: 'bold',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterButton: {
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: scaleFont(8),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: scaleFont(12),
  },
  detailItem: {
    flex: 1,
    minWidth: '28%',
  },
  detailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(4),
  },
  detailIconPill: {
    width: scaleFont(20),
    height: scaleFont(20),
    borderRadius: scaleFont(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
