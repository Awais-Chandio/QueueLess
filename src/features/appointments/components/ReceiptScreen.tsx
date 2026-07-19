import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, ChevronRight, Home, ArrowRight } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentService } from '../../../services/appointmentService';
import { getAppointmentDateLabel, getAppointmentTimeLabel } from '../utils/appointmentTime';
import type { AppStackParamList } from '../../../navigation/types';
import { scaleFont } from '../../../utils/responsive';

type ReceiptRouteProp = RouteProp<AppStackParamList, 'Receipt'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'Receipt'>;

const ReceiptScreen = () => {
  const route = useRoute<ReceiptRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const appointmentId = route.params?.appointmentId;

  const [appointment, setAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!appointmentId) return;
      try {
        setLoading(true);
        const data = await appointmentService.fetchAppointmentById(appointmentId);
        setAppointment(data);
      } catch (err) {
        console.warn('Failed to load appointment receipt:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [appointmentId]);

  const handleViewDetails = () => {
    navigation.replace('AppointmentDetails', { appointmentId });
  };

  const handleGoHome = () => {
    // Reset to MainTabs (which contains bottom tabs, showing Home Screen)
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !appointment ? (
          <View style={styles.center}>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
              Failed to load appointment details.
            </Text>
            <AppButton title="Go Home" onPress={handleGoHome} style={{ marginTop: spacing.md }} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Success Animation / Visual */}
            <View style={styles.successWrapper}>
              <View style={[styles.successCircle, { backgroundColor: colors.success + '15' }]}>
                <CheckCircle2 size={54} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.text, fontSize: typography.sizes.lg }]}>
                Booking Confirmed!
              </Text>
              <Text style={[styles.successSubtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                Your time slot has been secured.
              </Text>
            </View>

            {/* Receipt Ticket Card */}
            <Card variant="elevated" style={[styles.ticketCard, { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg }]}>
              {/* Token Number */}
              <View style={styles.tokenSection}>
                <Text style={[styles.tokenLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  YOUR TOKEN NUMBER
                </Text>
                <Text style={[styles.tokenValue, { color: colors.primary, fontSize: scaleFont(36) }]}>
                  #{appointment.token_number}
                </Text>
              </View>

              <View style={[styles.divider, { borderBottomColor: colors.border + '50' }]} />

              {/* Appointment Number */}
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Appointment ID</Text>
                <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                  {appointment.id ? appointment.id.split('-')[0].toUpperCase() : 'N/A'}
                </Text>
              </View>

              {/* Doctor & Service */}
              <View style={[styles.detailRow, { marginTop: spacing.md }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Doctor</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {appointment.doctor_name || 'Any Available Doctor'}
                </Text>
              </View>

              <View style={[styles.detailRow, { marginTop: spacing.md }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Service</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {appointment.service_name || 'Consultation'}
                </Text>
              </View>

              {/* Center */}
              <View style={[styles.detailRow, { marginTop: spacing.md }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Clinic Location</Text>
                <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                  {appointment.center_name || 'Clinic Center'}
                </Text>
              </View>

              {/* Date & Time */}
              <View style={[styles.detailRow, { marginTop: spacing.md }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Schedule</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {getAppointmentDateLabel(appointment)} @ {getAppointmentTimeLabel(appointment)}
                </Text>
              </View>
            </Card>

            {/* Quick Actions */}
            <View style={[styles.actions, { gap: spacing.md }]}>
              <AppButton
                title="Track Queue"
                onPress={handleViewDetails}
                variant="primary"
                rightIcon={<ArrowRight size={16} color="#FFFFFF" />}
              />
              <AppButton
                title="Go to Home Screen"
                onPress={handleGoHome}
                variant="outline"
                leftIcon={<Home size={16} color={colors.primary} />}
              />
            </View>
          </ScrollView>
        )}
      </View>
    </ScreenWrapper>
  );
};

export default ReceiptScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  successWrapper: {
    alignItems: 'center',
    marginVertical: 20,
  },
  successCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: '800',
    marginBottom: 4,
  },
  successSubtitle: {
    fontWeight: '600',
  },
  ticketCard: {
    width: '100%',
    marginVertical: 10,
    alignItems: 'stretch',
  },
  tokenSection: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  tokenLabel: {
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  tokenValue: {
    fontWeight: '900',
    marginTop: 6,
  },
  divider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '65%',
  },
  actions: {
    width: '100%',
    marginTop: 30,
  },
});
