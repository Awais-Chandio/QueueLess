import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Pressable,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Badge from '../../../components/ui/Badge';
import { MapPin, ChevronRight, Building2 } from 'lucide-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { useCentersStore } from '../../../store/centersStore';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

const CentersScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, radius, spacing, typography } = useTheme();

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
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
          Service Centers
        </Text>

        <FlatList
          data={centers}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderColor: colors.border,
                  borderWidth: 1,
                  padding: spacing.lg,
                  marginBottom: spacing.md,
                  shadowColor: colors.text,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: pressed ? 0.02 : 0.04,
                  shadowRadius: 12,
                  elevation: 2,
                },
                pressed && { opacity: 0.95 }
              ]}
              onPress={() =>
                navigation.navigate(
                  'CenterDetails',
                  {
                    centerId: item.id,
                  },
                )
              }>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primary + '10' }]}>
                  <Building2 size={20} color={colors.primary} />
                </View>
                <View style={styles.headerDetails}>
                  <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
                    {item.name}
                  </Text>
                  {!!item.category && (
                    <Badge label={item.category} variant="info" style={{ marginTop: spacing.xs }} />
                  )}
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
              </View>

              <View style={[styles.separator, { backgroundColor: colors.border + '50', marginVertical: spacing.md }]} />

              <View style={styles.locationContainer}>
                <MapPin size={16} color={colors.primary} style={{ marginRight: spacing.xs }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cityText, { color: colors.text, fontSize: typography.sizes.sm }]}>
                    {item.city}
                  </Text>
                  <Text style={[styles.addressText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {item.address}
                  </Text>
                </View>
              </View>
            </Pressable>
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
    fontWeight: '800',
  },
  card: {
    flexDirection: 'column',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  name: {
    fontWeight: '700',
  },
  separator: {
    height: 1,
    width: '100%',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cityText: {
    fontWeight: '600',
  },
  addressText: {
    marginTop: 2,
    lineHeight: 16,
  },
});
