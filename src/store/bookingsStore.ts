import { create } from 'zustand';

import { Booking } from '../types/booking';
import { bookingsService } from '../services/bookings/bookingsService';

interface BookingsState {
  bookings: Booking[];

  loading: boolean;
  error: string | null;

  createBooking: (payload: {
    user_id: string;
    center_id: string;
    service_id: string;
    booking_date: string;
    booking_time: string;
  }) => Promise<void>;

  fetchUserBookings: (userId: string) => Promise<void>;

  reset: () => void;
}

export const useBookingsStore = create<BookingsState>((set) => ({
  bookings: [],
  loading: false,
  error: null,

  createBooking: async (payload) => {
    try {
      set({ loading: true, error: null });

      const newBooking =
        await bookingsService.createBooking(payload);

      set((state) => ({
        bookings: [newBooking, ...state.bookings],
        loading: false,
      }));
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create booking',
      });
    }
  },

  fetchUserBookings: async (userId) => {
    try {
      set({ loading: true, error: null });

      const bookings =
        await bookingsService.getUserBookings(userId);

      set({
        bookings,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch bookings',
      });
    }
  },

  reset: () => {
    set({
      bookings: [],
      loading: false,
      error: null,
    });
  },
}));