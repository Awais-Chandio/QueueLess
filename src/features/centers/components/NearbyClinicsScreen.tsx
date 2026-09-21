import React, { useCallback } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, MapPin, RefreshCw } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { useTheme } from '../../../hooks/useTheme';
import { useNearbyClinics, NearbyCenter } from '../../../hooks/useNearbyClinics';
import { NearbyClinicCard } from './NearbyClinicCard';
import { NearbyClinicSkeleton } from '../../../components/NearbyClinicSkeleton';
import { NearbyEmptyState } from '../../../components/NearbyEmptyState';
import type { AppStackParamList } from '../../../navigation/types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'NearbyClinics'>;

const NearbyClinicsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  // Call our custom hook for nearby clinics logic
  const {
    loading,
    centers,
    errorMsg,
    permissionDenied,
    bannerMessage,
    isRefreshing,
    coords,
    refresh,
    requestPermission,
  } = useNearbyClinics();

  // Callback to navigate to center details (memoized)
  const handlePressBook = useCallback((centerId: string) => {
    navigation.navigate('CenterDetails', {
      centerId,
    });
  }, [navigation]);

  // Callback to render clinic card (memoized)
  const renderClinicCard = useCallback(({ item, index }: { item: NearbyCenter; index: number }) => (
    <NearbyClinicCard
      item={item}
      index={index}
      onPressBook={() => handlePressBook(item.id)}
    />
  ), [handlePressBook]);

  // Callback to get stable keys (memoized)
  const keyExtractor = useCallback((item: NearbyCenter) => item.id, []);

  // Main UI content helper
  const renderContent = () => {
    if (loading && !isRefreshing) {
      return <NearbyClinicSkeleton />;
    }

    if (permissionDenied) {
      return (
        <NearbyEmptyState
          type="permission"
          onAction={requestPermission}
          style={styles.centerContainer}
        />
      );
    }

    if (errorMsg) {
      return (
        <NearbyEmptyState
          type="error"
          onAction={refresh}
          style={styles.centerContainer}
        />
      );
    }

    if (centers.length === 0) {
      return (
        <NearbyEmptyState
          type="empty"
          onAction={() => navigation.navigate('Centers')}
          style={styles.centerContainer}
        />
      );
    }

    return (
      <View style={styles.listContainer}>
        {bannerMessage ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: colors.primary + '10',
                borderColor: colors.primary + '20',
                borderRadius: radius.md,
                marginHorizontal: spacing.md,
                marginTop: spacing.sm,
                marginBottom: spacing.xs,
                padding: spacing.sm,
              },
            ]}
          >
            <Text style={[styles.bannerText, { color: colors.primary, fontSize: typography.sizes.xs }]}>
              {bannerMessage}
            </Text>
          </View>
        ) : null}

        <FlatList
          data={centers}
          keyExtractor={keyExtractor}
          renderItem={renderClinicCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      </View>
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderBottomColor: colors.border + '30',
            borderBottomWidth: 1,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={24} color={colors.primary} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
              Nearby Clinics
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]} numberOfLines={1}>
              {coords ? `Near GPS: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Showing clinics near your current location'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={refresh}
          style={({ pressed }) => [styles.refreshIcon, pressed && { opacity: 0.7 }]}
        >
          <RefreshCw size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Main Body */}
      <View style={styles.body}>
        {renderContent()}
      </View>

      {/* Floating Action Button */}
      {!loading && !permissionDenied && !errorMsg && centers.length > 0 ? (
        <Pressable
          onPress={refresh}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
            pressed && styles.fabPressed,
          ]}
        >
          <MapPin size={16} color="#FFF" style={{ marginRight: spacing.xs }} />
          <Text style={[styles.fabText, { fontSize: typography.sizes.xs }]}>
            Use Current Location
          </Text>
        </Pressable>
      ) : null}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    paddingRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontWeight: '800',
  },
  headerSubtitle: {
    fontWeight: '500',
  },
  refreshIcon: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    flex: 1,
  },
  banner: {
    borderWidth: 1.2,
  },
  bannerText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0E7490',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  fabText: {
    color: '#FFF',
    fontWeight: '800',
  },
});

export default NearbyClinicsScreen;
