import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import AppButton from '../../components/common/AppButton';

import { colors, spacing, typography } from '../../theme';
import { supabase } from '../../services/supabase/client';
import { useBookingsStore } from '../../store/bookingsStore';
import type { AppStackParamList } from '../../navigation/types';

type Route = RouteProp<AppStackParamList, 'BookAppointment'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

const BookAppointmentScreen = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();

  const centerId = route.params.centerId;

  const { createBooking, loading } = useBookingsStore();

  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    if (!centerId) return;

    const { data } = await supabase
      .from('center_services')
      .select('*')
      .eq('center_id', centerId);

    setServices(data || []);
  };

  const handleBook = async () => {
    if (!selectedService || !centerId) return;

    await createBooking({
      user_id: 'CURRENT_USER_ID', // later auth store se ayega
      center_id: centerId,
      service_id: selectedService.id,
      booking_date: date,
      booking_time: time,
    });

    navigation.navigate('MyBookings' as never);
  };

  return React.createElement(
    ScreenWrapper,
    null,
    React.createElement(
      View,
      { style: styles.container },
      React.createElement(Text, { style: styles.title }, 'Select Service'),
      services.map((s) =>
        React.createElement(
          TouchableOpacity,
          {
            key: s.id,
            style: [
              styles.card,
              selectedService?.id === s.id && styles.selected,
            ],
            onPress: () => setSelectedService(s),
          },
          React.createElement(Text, { style: styles.name }, s.name),
          React.createElement(
            Text,
            { style: styles.meta },
            `${s.duration_minutes} min • Rs ${s.price}`,
          ),
        ),
      ),
      React.createElement(AppButton, {
        title: loading ? 'Booking...' : 'Confirm Booking',
        onPress: handleBook,
      }),
    ),
  );
};

export default BookAppointmentScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },

  title: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    color: colors.text,
  },

  card: {
    padding: spacing.md,
    backgroundColor: '#fff',
    marginBottom: spacing.sm,
    borderRadius: 10,
  },

  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },

  name: {
    fontSize: typography.body,
    fontWeight: '600',
  },

  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
});