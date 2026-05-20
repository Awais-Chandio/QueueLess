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
    scheduled_at: string;
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
      console.log('[DEBUG] Store: Creating booking with payload:', payload);
      set({ loading: true, error: null });

      const newBooking =
        await bookingsService.createBooking(payload);

      set((state) => ({
        bookings: [newBooking, ...state.bookings],
        loading: false,
      }));
      console.log('[DEBUG] Store: Booking created and added to state');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create booking';

      console.error('[DEBUG] Store: Failed to create booking:', message);
      set({
        loading: false,
        error: message,
      });

      throw new Error(message);
    }
  },

  fetchUserBookings: async (userId) => {
    try {
      console.log('[DEBUG] Store: Fetching bookings for user:', userId);
      set({ loading: true, error: null });

      const bookings =
        await bookingsService.fetchUserBookings(userId);

      set({
        bookings,
        loading: false,
      });
      console.log('[DEBUG] Store: Bookings fetched and updated in state');
    } catch (error) {
      console.error('[DEBUG] Store: Failed to fetch bookings:', error);
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
