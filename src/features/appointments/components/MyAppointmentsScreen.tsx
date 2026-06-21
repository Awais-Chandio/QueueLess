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
import { Card } from '../../../components/ui/Card';
import { Badge, BadgeVariant } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { SkeletonLoader } from '../../../components/animations/SkeletonLoader';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useTheme } from '../../../hooks/useTheme';
import { useAppointments } from '../hooks/useAppointments';
import { useAuthStore } from '../../../store/authStore';
import type { AppStackParamList } from '../../../navigation/types';
import type { AppointmentStatus } from '../../../types/appointment';
import { Calendar, Clock, MapPin, SearchX } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'all' | AppointmentStatus;

const statusFilters: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
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

  const filteredAppointments = selectedStatus === 'all' 
    ? appointments 
    : appointments.filter(item => item.status === selectedStatus);

  const formatStatus = (status: AppointmentStatus) =>
    status
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const getStatusVariant = (status: AppointmentStatus): BadgeVariant => {
    switch (status) {
      case 'confirmed': return 'success';
      case 'in_progress': return 'warning';
      case 'cancelled': return 'error';
      case 'completed': return 'default';
      case 'pending':
      default: return 'warning';
    }
  };

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

        <View style={[styles.filterRow, { marginBottom: spacing.md, gap: spacing.sm }]}>
          {statusFilters.map(status => {
            const isSelected = selectedStatus === status;
            return (
              <Pressable
                key={status}
                onPress={() => setSelectedStatus(status)}
                style={[
                  styles.filterButton,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderRadius: radius.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                  }
                ]}
              >
                <Text style={{
                  color: isSelected ? '#FFF' : colors.textSecondary,
                  fontSize: typography.sizes.sm,
                  fontWeight: '600'
                }}>
                  {status === 'all' ? 'All' : formatStatus(status)}
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
            renderItem={({ item, index }) => (
              <CardFadeIn delay={Math.min(index * 80, 400)}>
                <Pressable onPress={() => navigation.navigate('AppointmentDetails', { appointmentId: item.id })}>
                  <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '700' }}>
                        {item.service_name ?? 'Service'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
                        <MapPin size={scaleFont(14)} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: spacing.xs, flex: 1 }}>
                          {item.center_name ?? 'Center'}
                        </Text>
                      </View>
                    </View>
                    <Badge label={formatStatus(item.status as AppointmentStatus)} variant={getStatusVariant(item.status as AppointmentStatus)} />
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

                  <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs / 2 }}>
                        <Calendar size={scaleFont(14)} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: spacing.xs }}>Date</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {new Date(item.scheduled_at).toLocaleDateString()}
                      </Text>
                    </View>

                    <View style={styles.detailItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs / 2 }}>
                        <Clock size={scaleFont(14)} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: spacing.xs }}>Time</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {typeof item.token_number === 'number' && (
                      <View style={styles.detailItem}>
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.xs / 2 }}>Token</Text>
                        <Text style={{ color: colors.primary, fontSize: typography.sizes.md, fontWeight: 'bold' }}>
                          #{item.token_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              </Pressable>
              </CardFadeIn>
            )}
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
  }
});
