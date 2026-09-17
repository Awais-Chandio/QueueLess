import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Search, UsersRound } from 'lucide-react-native';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import MedicalFAB from '../../../components/ui/MedicalFAB';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { useTheme } from '../../../hooks/useTheme';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { toastService } from '../../../services/toastService';
import { hp, wp } from '../../../utils/responsive';
import { staffService, type StaffProfile } from '../api/staffService';
import StaffCard from './StaffCard';

type ManageStaffScreenNavigationProp = NativeStackNavigationProp<
  AdminStackParamList,
  'ManageStaff'
>;

export const STAFF_QUERY_KEY = ['admin-staff'] as const;

const ManageStaffScreen = () => {
  const navigation = useNavigation<ManageStaffScreenNavigationProp>();
  const queryClient = useQueryClient();
  const { colors, spacing, typography, radius } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('all');

  const {
    data: staff = [],
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: STAFF_QUERY_KEY,
    queryFn: staffService.getAll,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: staffService.deleteAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      toastService.success('Staff account deleted successfully.');
    },
    onError: (deleteError: Error) => {
      toastService.error('Unable to delete staff account.', deleteError.message);
    },
  });

  const centers = useMemo(() => {
    const centerMap = new Map<string, string>();
    staff.forEach(member => {
      member.centers.forEach(center => centerMap.set(center.id, center.name));
    });

    return [
      { id: 'all', name: 'All Clinics' },
      ...Array.from(centerMap, ([id, name]) => ({ id, name })),
    ];
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return staff.filter(member => {
      const matchesSearch =
        !query ||
        member.full_name?.toLowerCase().includes(query) ||
        member.email?.toLowerCase().includes(query) ||
        member.phone?.toLowerCase().includes(query);
      const matchesCenter =
        selectedCenterId === 'all' || member.centers.some(center => center.id === selectedCenterId);

      return Boolean(matchesSearch && matchesCenter);
    });
  }, [searchQuery, selectedCenterId, staff]);

  const confirmDelete = (member: StaffProfile) => {
    Alert.alert(
      'Delete Staff Account',
      `Delete ${member.full_name || 'this staff member'}? Their login and profile will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(member.id),
        },
      ],
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={24} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl }]}>Staff Directory</Text>
        </View>

        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <Search size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
          <TextInput
            placeholder="Search by name, email, or phone..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.text, fontSize: typography.sizes.sm }]}
          />
        </View>

        <View style={styles.filtersWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {centers.map(center => {
              const selected = center.id === selectedCenterId;
              return (
                <Pressable
                  key={center.id}
                  onPress={() => setSelectedCenterId(center.id)}
                  style={[
                    styles.chipButton,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.onPrimary : colors.text, fontSize: typography.sizes.xs },
                    ]}
                  >
                    {center.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.resultsCount, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Showing {filteredStaff.length} of {staff.length} staff members
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textSecondary, marginTop: spacing.md, fontSize: typography.sizes.sm }}>
              Loading staff directory...
            </Text>
          </View>
        ) : isError ? (
          <View style={{ flex: 1, padding: spacing.md }}>
            <ErrorState
              title="Failed to Load Staff"
              message={error instanceof Error ? error.message : 'Please try again.'}
              buttonTitle="Retry"
              onRetry={() => refetch()}
            />
          </View>
        ) : filteredStaff.length === 0 ? (
          <View style={{ flex: 1, padding: spacing.md }}>
            <EmptyState
              title="No Staff Found"
              subtitle={staff.length === 0 ? 'Create a staff account to get started.' : 'Try changing your search or clinic filter.'}
              buttonTitle={staff.length === 0 ? 'Create Staff Account' : undefined}
              onButtonPress={staff.length === 0 ? () => navigation.navigate('CreateAccount', { role: 'staff' }) : undefined}
              Icon={UsersRound}
            />
          </View>
        ) : (
          <FlatList
            data={filteredStaff}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <StaffCard
                staff={item}
                deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
                onEdit={() => navigation.navigate('EditStaff', { staffId: item.id })}
                onDelete={() => confirmDelete(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching && !isLoading}
            onRefresh={() => refetch()}
            showsVerticalScrollIndicator={false}
          />
        )}

        <MedicalFAB
          onPress={() => navigation.navigate('CreateAccount', { role: 'staff' })}
          style={styles.fab}
        />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(4),
    marginTop: hp(1.5),
    marginBottom: hp(2),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
    marginLeft: 4,
  },
  title: {
    fontWeight: '800',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginHorizontal: wp(4),
    marginBottom: 12,
    height: 48,
    borderWidth: 1.2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontWeight: '600',
  },
  filtersWrapper: {
    paddingHorizontal: wp(4),
    marginBottom: 16,
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontWeight: '600',
  },
  resultsCount: {
    marginTop: 8,
    fontWeight: '600',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: wp(4),
    paddingBottom: 88,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
  },
});

export default ManageStaffScreen;
