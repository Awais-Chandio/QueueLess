import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Pressable,
} from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import AppButton from '../../../components/ui/AppButton';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import {
  Clock,
  MapPin,
  Sparkles,
  ChevronLeft,
  CreditCard,
  Hourglass,
  Stethoscope,
  Heart,
  Eye,
  FlaskConical,
  Smile,
  Brain,
  Bone,
  Baby,
  Wind,
  Activity,
  User,
  Info,
} from 'lucide-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { centersService } from '../api/centersService';

import type {
  Center,
  CenterService,
} from '../../../types/center';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

type CenterDetailsRouteProp = RouteProp<
  AppStackParamList,
  'CenterDetails'
>;

/** Map a department name to a contextual Lucide icon */
const getDepartmentIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('general') || lower.includes('physician') || lower.includes('gp')) return Stethoscope;
  if (lower.includes('cardio') || lower.includes('heart')) return Heart;
  if (lower.includes('dental') || lower.includes('tooth') || lower.includes('ortho')) return Smile;
  if (lower.includes('eye') || lower.includes('ophthal')) return Eye;
  if (lower.includes('lab') || lower.includes('pathol') || lower.includes('test')) return FlaskConical;
  if (lower.includes('neuro') || lower.includes('brain')) return Brain;
  if (lower.includes('bone') || lower.includes('orthoped') || lower.includes('spine')) return Bone;
  if (lower.includes('pediatric') || lower.includes('child') || lower.includes('baby')) return Baby;
  if (lower.includes('pulmo') || lower.includes('chest') || lower.includes('respir')) return Wind;
  if (lower.includes('emer') || lower.includes('urgent') || lower.includes('acute')) return Activity;
  return Stethoscope; // default fallback
};

const CenterDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CenterDetailsRouteProp>();
  const { colors, radius, spacing, typography } = useTheme();

  const { centerId } = route.params as { centerId: string };

  const [center, setCenter] = useState<Center | null>(null);
  const [services, setServices] = useState<CenterService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCenterDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const centerData = await centersService.getCenterById(centerId);
      const servicesData = await centersService.getCenterServices(centerId);

      setCenter(centerData);
      setServices(servicesData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load clinic details',
      );
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    fetchCenterDetails();
  }, [fetchCenterDetails]);

  const formatTime = (time: string | null) => {
    if (!time) {
      return null;
    }

    const [hours, minutes] = time.split(':');
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openingTime = formatTime(center?.open_time ?? null);
  const closingTime = formatTime(center?.close_time ?? null);

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
          title="Failed To Load Clinic"
          message={error}
          buttonTitle="Retry"
          onRetry={fetchCenterDetails}
        />
      </ScreenWrapper>
    );
  }

  if (!center) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Clinic Not Found"
          subtitle="Unable to find this clinic"
          buttonTitle="Go Back"
          onButtonPress={() => navigation.goBack()}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={services}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.xs }]}>
              {center.name}
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
              {center.city}
            </Text>

            {!!center.category && (
              <Badge label={center.category} variant="info" style={{ marginBottom: spacing.md }} />
            )}

            <View style={styles.addressContainer}>
              <MapPin size={16} color={colors.primary} style={{ marginRight: spacing.xs, marginTop: 2 }} />
              <Text style={[styles.address, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                {center.address}
              </Text>
            </View>

            {!!center.description && (
              <Text style={[styles.description, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.md }]}>
                {center.description}
              </Text>
            )}

            {openingTime && closingTime && (
              <Card
                variant="flat"
                style={[styles.timingCard, { marginTop: spacing.lg, padding: spacing.md }]}
              >
                <View style={styles.cardRow}>
                  <Clock size={16} color={colors.primary} style={{ marginRight: spacing.xs }} />
                  <Text style={[styles.timingLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    Working Hours
                  </Text>
                </View>

                <Text style={[styles.timingValue, { color: colors.text, fontSize: typography.sizes.md, marginTop: spacing.xs }]}>
                  {openingTime} - {closingTime}
                </Text>
              </Card>
            )}

            <View style={[styles.sectionTitleRow, { marginTop: spacing.lg, marginBottom: spacing.xs }]}>
              <Sparkles size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Available Departments
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const DeptIcon = getDepartmentIcon(item.name);
          return (
            <Card
              variant="elevated"
              style={[styles.serviceCard, { padding: spacing.md }]}
              containerStyle={{ marginBottom: spacing.md }}
            >
              <View style={styles.serviceHeader}>
                <View style={[styles.deptIconContainer, { backgroundColor: colors.primary + '12', borderRadius: radius.md }]}>
                  <DeptIcon size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.serviceName, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.xs }]}>
                    {item.name}
                  </Text>

                  {!!item.description && (
                    <Text style={[styles.serviceDescription, { color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
                      {item.description}
                    </Text>
                  )}

                  {!!item.on_duty_note && (
                    <View style={[styles.onDutyRow, { backgroundColor: colors.primary + '08', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }]}>
                      <Info size={11} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={[styles.onDutyText, { color: colors.primary, fontSize: typography.sizes.xs }]}>
                        {item.on_duty_note}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={[styles.metaItem, { backgroundColor: colors.border + '30', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                  <Hourglass size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {item.duration_minutes} mins
                  </Text>
                </View>

                <View style={[styles.metaItem, { backgroundColor: colors.border + '30', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                  <CreditCard size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    Rs. {item.price}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No Departments Found"
            subtitle="No departments available for this clinic"
          />
        }
        ListFooterComponent={
          <AppButton
            title="Book a Consultation"
            style={{ marginTop: spacing.md }}
            onPress={() =>
              navigation.navigate(
                'BookAppointment',
                {
                  centerId: center.id,
                },
              )
            }
          />
        }
      />
    </ScreenWrapper>
  );
};

export default CenterDetailsScreen;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '600',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  address: {
    flex: 1,
    lineHeight: 18,
  },
  description: {
    lineHeight: 20,
  },
  timingCard: {
    borderWidth: 0,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timingLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timingValue: {
    fontWeight: '800',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '800',
  },
  serviceCard: {
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deptIconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    fontWeight: '800',
  },
  serviceDescription: {
    lineHeight: 16,
  },
  onDutyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  onDutyText: {
    flex: 1,
    fontWeight: '600',
    lineHeight: 15,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontWeight: '700',
  },
});
