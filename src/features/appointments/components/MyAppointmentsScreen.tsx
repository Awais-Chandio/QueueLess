import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { Badge, BadgeVariant } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useTheme } from '../../../hooks/useTheme';
import { useAppointments } from '../hooks/useAppointments';
import type { AppStackParamList } from '../../../navigation/types';
import type { AppointmentFull, AppointmentStatus } from '../../../types/appointment';
import { Calendar, Clock, MapPin, SearchX } from 'lucide-react-native';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'all' | AppointmentStatus;

const statusFilters: StatusFilter[] = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

const MyAppointmentsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();
  const { data: appointments = [], isLoading, isRefetching, refetch } = useAppointments();
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');

  const filteredAppointments = selectedStatus === 'all' 
    ? appointments 
    : appointments.filter(item => item.status === selectedStatus);

  const formatStatus = (status: AppointmentStatus) => status.charAt(0).toUpperCase() + status.slice(1);

  const getStatusVariant = (status: AppointmentStatus): BadgeVariant => {
    switch (status) {
      case 'confirmed': return 'success';
      case 'cancelled': return 'error';
      case 'completed': return 'default';
      case 'pending':
      default: return 'warning';
    }
  };

  const renderSkeleton = () => (
    <View style={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <Skeleton height={140} />
      <Skeleton height={140} />
      <Skeleton height={140} />
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

        {isLoading ? (
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
            onRefresh={refetch}
            refreshing={isRefetching}
            ListEmptyComponent={
              <EmptyState
                Icon={SearchX}
                title="No Appointments"
                subtitle="No appointments found for this status."
              />
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => navigation.navigate('AppointmentDetails', { appointmentId: item.id })}>
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '700' }}>
                        {item.service_name ?? 'Service'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <MapPin size={14} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: 4 }}>
                          {item.center_name ?? 'Center'}
                        </Text>
                      </View>
                    </View>
                    <Badge label={formatStatus(item.status as AppointmentStatus)} variant={getStatusVariant(item.status as AppointmentStatus)} />
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

                  <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Calendar size={14} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: 4 }}>Date</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {new Date(item.scheduled_at).toLocaleDateString()}
                      </Text>
                    </View>

                    <View style={styles.detailItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Clock size={14} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: 4 }}>Time</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {typeof item.token_number === 'number' && (
                      <View style={styles.detailItem}>
                        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: 2 }}>Token</Text>
                        <Text style={{ color: colors.primary, fontSize: typography.sizes.md, fontWeight: 'bold' }}>
                          #{item.token_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              </Pressable>
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
  },
  divider: {
    height: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  }
});
