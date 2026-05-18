import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

import { useAuthStore } from '../../store/authStore';
import { bookingsService } from '../../services/bookings/bookingsService';

import { colors, spacing, typography } from '../../theme';

import type { Booking } from '../../types/booking';

const MyBookingsScreen = () => {
  const user = useAuthStore(state => state.user);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    if (!user?.id) return;

    setLoading(true);

    try {
      const data = await bookingsService.fetchUserBookings(user.id);
      setBookings(data);
    } catch (error) {
      console.log(error);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (bookings.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Bookings"
          subtitle="You haven't booked anything yet"
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>My Bookings</Text>

        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>
                Service ID: {item.service_id}
              </Text>

              <Text style={styles.meta}>
                Date: {item.booking_date}
              </Text>

              <Text style={styles.meta}>
                Time: {item.booking_time}
              </Text>

              <Text style={styles.status}>
                Status: {item.status}
              </Text>
            </View>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default MyBookingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

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

  name: {
    fontSize: typography.body,
    fontWeight: '600',
  },

  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },

  status: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    fontWeight: 'bold',
    color: colors.primary,
  },
});