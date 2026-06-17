import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';

import { colors, spacing, typography } from '../../../theme';

import type { AppStackParamList } from '../../../navigation/types';

import { useCentersStore } from '../../../store/centersStore';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

const CentersScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const {
    centers,
    loading,
    error,
    fetchCenters,
  } = useCentersStore();

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Failed To Load Centers"
          message={error}
          buttonTitle="Retry"
          onRetry={fetchCenters}
        />
      </ScreenWrapper>
    );
  }

  if (centers.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Centers Found"
          subtitle="No centers available right now"
          buttonTitle="Reload"
          onButtonPress={fetchCenters}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>
          Service Centers
        </Text>

        <FlatList
          data={centers}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate(
                  'CenterDetails',
                  {
                    centerId: item.id,
                  },
                )
              }>
              <Text style={styles.name}>
                {item.name}
              </Text>

              {!!item.category && (
                <Text style={styles.category}>
                  {item.category}
                </Text>
              )}

              <Text style={styles.meta}>
                {item.city}
              </Text>

              <Text style={styles.meta}>
                {item.address}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default CentersScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  title: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.lg,
  },

  listContent: {
    paddingBottom: spacing.xl,
  },

  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
  },

  name: {
    fontSize: typography.body,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  category: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: 999,
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '700',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
