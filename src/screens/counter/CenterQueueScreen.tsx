import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Clock,
  ClipboardList,
  Search,
  LogOut,
  Settings,
  UserCheck,
} from 'lucide-react-native';
import AppInput from '../../components/ui/AppInput';
import { StatusChip } from '../../components/ui/StatusChip';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import { CardFadeIn } from '../../components/animations/CardFadeIn';
import { useAuth } from '../../hooks/useAuth';
import { useProfileStore } from '../../store/profileStore';
import { useTheme } from '../../hooks/useTheme';
import { useStaffQueueStore } from '../../store/queueStore';
import type { AppointmentFull } from '../../types/appointment';
import { scaleFont } from '../../utils/responsive';
import { queueService } from '../../services/queueService';
import { centerService } from '../../services/centerService';
import { getAppointmentTimeLabel } from '../../features/appointments/utils/appointmentTime';
import { getAppointmentStatusState } from '../../services/bookingService';
import { getDisplayName } from '../../utils/getDisplayName';

const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const CenterQueueScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout } = useAuth();
  const navigation = useNavigation<any>();
  const profile = useProfileStore(state => state.profile);

  const [centerName, setCenterName] = useState<string | null>(null);

  useEffect(() => {
    const centerId = profile?.center_id;
    if (centerId) {
      const fetchCenterName = async () => {
        try {
          const data = await centerService.getCenterById(centerId);
          if (data?.name) {
            setCenterName(data.name);
          }
        } catch (err) {
          console.warn('Failed to fetch assigned center name:', err);
        }
      };
      fetchCenterName();
    }
  }, [profile]);

  const queryClient = useQueryClient();
  const setStaffAppointments = useStaffQueueStore(
    state => state.setAppointments,
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'queue' | 'checked_in' | 'serving' | 'completed' | 'cancelled'
  >('queue');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['staff-dashboard', 'today'],
    queryFn: () => queueService.fetchDashboard('today'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(
    () => data?.appointments ?? [],
    [data?.appointments],
  );
  const stats = data?.stats;

  const uniqueDoctors = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach(item => {
      if (item.doctor_id) {
        map.set(item.doctor_id, item.doctor_name || 'Doctor');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [appointments]);

  useEffect(() => {
    if (appointments.length || data) {
      setStaffAppointments(appointments);
    }
  }, [appointments, data, setStaffAppointments]);

  useEffect(() => {
    if (!isFocused) return;

    const channel = queueService.subscribeToAppointments({
      channelName: `center-dashboard-today-${Date.now()}`,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      },
    });

    return () => {
      queueService.unsubscribeAppointments(channel);
    };
  }, [queryClient, isFocused]);

  const filteredQueueAppointments = useMemo(() => {
    return appointments.filter(item => {
      // 0. Filter by doctor
      if (selectedDoctorId && item.doctor_id !== selectedDoctorId) {
        return false;
      }

      const { resolvedStatus } = getAppointmentStatusState(item);

      // 1. Filter by status
      let matchesStatus = false;
      if (statusFilter === 'queue') {
        matchesStatus = [
          'confirmed',
          'checked_in',
          'called',
          'in_progress',
        ].includes(resolvedStatus);
      } else if (statusFilter === 'checked_in') {
        matchesStatus = resolvedStatus === 'checked_in';
      } else if (statusFilter === 'serving') {
        matchesStatus = ['called', 'in_progress'].includes(resolvedStatus);
      } else if (statusFilter === 'completed') {
        matchesStatus = resolvedStatus === 'completed';
      } else if (statusFilter === 'cancelled') {
        matchesStatus = ['cancelled', 'expired', 'no_show', 'skipped'].includes(
          resolvedStatus,
        );
      }

      if (!matchesStatus) return false;

      // 2. Filter by search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const patientName = item.patient_name?.toLowerCase() || '';
        const serviceName = item.service_name?.toLowerCase() || '';
        const tokenStr = item.token_number?.toString() || '';
        return (
          patientName.includes(query) ||
          serviceName.includes(query) ||
          tokenStr.includes(query)
        );
      }

      return true;
    });
  }, [appointments, statusFilter, searchQuery, selectedDoctorId]);

  const renderAppointmentItem = (
    item: AppointmentFull,
    index: number,
  ) => {
    const { resolvedStatus } = getAppointmentStatusState(item);

    return (
      <View
        key={item.id}
        style={[
          styles.itemContainer,
          index > 0 && {
            borderTopWidth: 1,
            borderTopColor: colors.border + '50',
            paddingTop: spacing.md,
            marginTop: spacing.md,
          },
        ]}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleWrap}>
            <View style={styles.itemMainRow}>
              {/* Token badge pill */}
              <View
                style={[
                  styles.tokenPill,
                  {
                    backgroundColor: `${colors.primary}10`,
                    borderColor: `${colors.primary}30`,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tokenText,
                    { color: colors.primary, fontSize: typography.sizes.sm },
                  ]}
                >
                  {typeof item.token_number === 'number'
                    ? `#${item.token_number}`
                    : 'No Token'}
                </Text>
              </View>
              <Text
                style={[
                  styles.patientNameText,
                  { color: colors.text, fontSize: typography.sizes.md },
                ]}
                numberOfLines={1}
              >
                {item.patient_name || 'Anonymous Patient'}
              </Text>
            </View>
            <View style={{ height: 4 }} />
            <Text
              style={[
                styles.serviceText,
                { color: colors.textSecondary, fontSize: typography.sizes.sm },
              ]}
            >
              {item.service_name || 'Consultation'} • Dr. {item.doctor_name || 'Any Doctor'}
            </Text>
          </View>
          <StatusChip
            status={resolvedStatus}
            label={statusLabel(resolvedStatus)}
          />
        </View>

        <View style={[styles.itemSubRow, { marginTop: spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Clock size={scaleFont(14)} color={colors.textSecondary} />
            <Text
              style={[
                styles.subRowText,
                { color: colors.textSecondary, marginLeft: spacing.xs, fontSize: typography.sizes.sm },
              ]}
            >
              {getAppointmentTimeLabel(item)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderStatsCard = (
    title: string,
    value: string | number,
    icon: React.ReactNode,
    color: string,
  ) => (
    <Card variant="elevated" style={styles.statsCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>{title}</Text>
          <Text style={[styles.statsValue, { color: colors.text }]}>{value}</Text>
        </View>
        <View style={[styles.statsIconContainer, { backgroundColor: color + '15' }]}>
          {icon}
        </View>
      </View>
    </Card>
  );

  return (
    <ScreenWrapper scrollable>
      {/* Top Header */}
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={[styles.welcomeText, { color: colors.text }]} numberOfLines={1}>
            {centerName || 'Center Dashboard'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            Center Queue Monitor
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('CheckIn')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <UserCheck size={scaleFont(22)} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('QueueSettings')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Settings size={scaleFont(22)} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={logout}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
             <LogOut size={scaleFont(22)} color={colors.error} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load center queue.'}
          buttonTitle="Retry"
          onRetry={refetch}
        />
      ) : (
        <View>
          {/* Stats Bar */}
          <View style={[styles.statsGrid, { gap: spacing.md, marginBottom: spacing.lg }]}>
            {renderStatsCard(
              'Total Today',
              stats?.totalToday ?? 0,
              <ClipboardList size={scaleFont(20)} color={colors.primary} />,
              colors.primary,
            )}
            {renderStatsCard(
              'Active Waiting',
              stats?.activeQueue ?? 0,
              <Users size={scaleFont(20)} color={colors.success} />,
              colors.success,
            )}
          </View>

          {/* Core Queue List with search and filter tabs */}
          <CardFadeIn delay={20}>
            <Card variant="elevated" style={styles.cardContent}>
              <View style={styles.filterSection}>
                <AppInput
                  placeholder="Search patient, token..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  leftIcon={Search}
                />

                {/* Doctor Filter Scroll View */}
                {uniqueDoctors.length > 0 && (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                      Filter by Doctor:
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                      <Pressable
                        onPress={() => setSelectedDoctorId(null)}
                        style={[
                          styles.doctorTag,
                          {
                            backgroundColor: selectedDoctorId === null ? colors.primary : colors.border + '30',
                          }
                        ]}
                      >
                        <Text style={{ color: selectedDoctorId === null ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700' }}>
                          All Doctors
                        </Text>
                      </Pressable>
                      {uniqueDoctors.map(doc => (
                        <Pressable
                          key={doc.id}
                          onPress={() => setSelectedDoctorId(doc.id)}
                          style={[
                            styles.doctorTag,
                            {
                              backgroundColor: selectedDoctorId === doc.id ? colors.primary : colors.border + '30',
                            }
                          ]}
                        >
                          <Text style={{ color: selectedDoctorId === doc.id ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700' }}>
                            Dr. {doc.name.split(' ')[0]}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
                
                {/* Horizontal Scroll Tab Filter */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
                >
                  {[
                    { id: 'queue', label: 'All Waiting' },
                    { id: 'checked_in', label: 'Checked In' },
                    { id: 'serving', label: 'In Progress' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'cancelled', label: 'Cancelled/Skipped' },
                  ].map(tab => (
                    <Pressable
                      key={tab.id}
                      onPress={() => setStatusFilter(tab.id as any)}
                      style={({ pressed }) => [
                        styles.tabButton,
                        {
                          borderColor: statusFilter === tab.id ? colors.primary : colors.border + '50',
                          backgroundColor: statusFilter === tab.id ? colors.primary + '10' : 'transparent',
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={{
                        color: statusFilter === tab.id ? colors.primary : colors.textSecondary,
                        fontWeight: '700',
                        fontSize: typography.sizes.sm,
                      }}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Main List */}
              <View style={{ marginTop: spacing.md }}>
                {filteredQueueAppointments.length === 0 ? (
                  <EmptyState
                    title="No Patients Found"
                    subtitle="No appointments in this queue filter."
                  />
                ) : (
                  filteredQueueAppointments.map((item, idx) =>
                    renderAppointmentItem(item, idx),
                  )
                )}
              </View>
            </Card>
          </CardFadeIn>
        </View>
      )}
    </ScreenWrapper>
  );
};

export default CenterQueueScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  welcomeText: {
    fontWeight: '800',
    fontSize: 22,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 8,
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statsCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statsValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  statsIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    padding: 16,
  },
  filterSection: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1.5,
  },
  doctorTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  itemContainer: {
    paddingVertical: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tokenText: {
    fontWeight: '700',
  },
  patientNameText: {
    fontWeight: '700',
  },
  serviceText: {
    fontWeight: '500',
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subRowText: {
    fontWeight: '600',
  },
});
