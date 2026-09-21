import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ScrollView,
  TextStyle,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { SkeletonLoader } from '../../../components/animations/SkeletonLoader';
import AppointmentTile from '../../../components/ui/AppointmentTile';
import { useTheme } from '../../../hooks/useTheme';
import { useAppointments } from '../../../hooks/useAppointments';
import { useAuthStore } from '../../../store/authStore';
import type { AppStackParamList } from '../../../navigation/types';
import { getAppointmentStatusState } from '../../../services/bookingService';
import { SearchX } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'active_upcoming' | 'past_completed';

const statusFilters = [
  { key: 'active_upcoming' as const, label: 'Active / Upcoming', dotColor: '#3B82F6' },
  { key: 'past_completed' as const, label: 'Past / Completed', dotColor: '#10B981' },
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
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('active_upcoming');
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
    if (selectedStatus === 'active_upcoming') {
      return ['pending', 'confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedStatus);
    }
    if (selectedStatus === 'past_completed') {
      return ['completed', 'cancelled', 'expired', 'no_show'].includes(resolvedStatus);
    }
    return false;
  });

  const skeletonContainerStyle = { paddingBottom: spacing.xl };

  const renderSkeleton = () => (
    <View style={skeletonContainerStyle}>
      <SkeletonLoader height={140} count={3} gap={spacing.md} />
    </View>
  );

  // Dynamic Styles
  const titleStyle = [
    styles.title,
    {
      color: colors.text,
      fontSize: typography.sizes.xxl,
      marginBottom: spacing.lg,
    },
  ];

  const filterListStyle = [
    styles.filterList,
    { marginBottom: spacing.md },
  ];

  const filterListContentStyle = {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  };

  const listContentStyle = [
    styles.listContent,
    { paddingBottom: spacing.xl },
  ];

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={titleStyle}>
          My Appointments
        </Text>

        {/* Status filter chips with dot indicators */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={filterListStyle}
          contentContainerStyle={filterListContentStyle}
        >
          {statusFilters.map(filter => {
            const isSelected = selectedStatus === filter.key;
            const dotColor = filter.dotColor;

            const filterButtonStyle = [
              styles.filterButton,
              {
                borderColor: isSelected ? dotColor : colors.border,
                backgroundColor: isSelected ? dotColor + '18' : colors.surface,
                borderRadius: radius.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              },
            ];

            const dotStyle = [
              styles.filterDot,
              {
                backgroundColor: isSelected ? dotColor : colors.textSecondary + '60',
              },
            ];

            const filterButtonTextStyle = {
              color: isSelected ? dotColor : colors.textSecondary,
              fontSize: typography.sizes.sm,
              fontWeight: (isSelected ? '700' : '500') as TextStyle['fontWeight'],
            };

            return (
              <Pressable
                key={filter.key}
                onPress={() => setSelectedStatus(filter.key)}
                style={({ pressed }) => [
                  filterButtonStyle,
                  pressed && styles.pressedEffect,
                ]}
              >
                <View style={dotStyle} />
                <Text style={filterButtonTextStyle}>
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
            contentContainerStyle={listContentStyle}
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
              <AppointmentTile
                item={item}
                index={index}
                onPress={() =>
                  navigation.navigate('AppointmentDetails', {
                    appointmentId: item.id,
                  })
                }
                onPressQueue={() =>
                  navigation.navigate('QueueStatus', {
                    appointmentId: item.id,
                  })
                }
              />
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
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  filterList: {
    maxHeight: scaleFont(44),
  },
  filterButton: {
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(5),
    height: scaleFont(30),
  },
  filterDot: {
    width: scaleFont(6),
    height: scaleFont(6),
    borderRadius: scaleFont(3),
  },
  pressedEffect: {
    opacity: 0.75,
  },
  listContent: {
    flexGrow: 1,
  },
});
