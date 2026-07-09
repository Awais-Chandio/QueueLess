import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import { Hospital, MapPin } from 'lucide-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { useCentersStore } from '../../../store/centersStore';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

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
            <Card
              onPress={() =>
                navigation.navigate(
                  'CenterDetails',
                  {
                    centerId: item.id,
                  },
                )
              }
              variant="elevated"
              style={[
                styles.card,
                {
                  padding: spacing.md,
                },
              ]}
              containerStyle={{ marginBottom: spacing.md }}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primary + '12', borderRadius: radius.md }]}>
                  <Hospital size={22} color={colors.primary} />
                </View>
                <View style={[styles.titleContainer, { marginLeft: spacing.md }]}>
                  <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.city, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                    {item.city}
                  </Text>
                </View>
              </View>

              <View style={[styles.addressContainer, { marginTop: spacing.md }]}>
                <MapPin size={14} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                <Text style={[styles.address, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  {item.address}
                </Text>
              </View>

              {!!item.category && (
                <View style={[styles.badgeContainer, { marginTop: spacing.sm }]}>
                  <Badge label={item.category} variant="info" />
                </View>
              )}
            </Card>
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
    letterSpacing: 0.3,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontWeight: '800',
  },
  city: {
    fontWeight: '600',
    marginTop: 2,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  address: {
    fontWeight: '500',
  },
  badgeContainer: {
    flexDirection: 'row',
  },
});
