import { supabase } from '../supabase/client';
import { Booking } from '../../types/booking';

type CreateBookingPayload = {
  user_id: string;
  center_id: string;
  service_id: string;
  scheduled_at: string;
};

export const bookingsService = {
  async createBooking(
    payload: CreateBookingPayload,
  ): Promise<Booking> {
    console.log('[DEBUG] Creating booking with payload:', payload);
    
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        ...payload,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[DEBUG] Failed to create booking:', error.message);
      throw new Error(error.message);
    }

    console.log('[DEBUG] Booking created successfully:', data);
    return data as Booking;
  },

  async fetchUserBookings(
    userId: string,
  ): Promise<Booking[]> {
    console.log('[DEBUG] Fetching bookings for user:', userId);
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('scheduled_at', {
        ascending: true,
      });

    if (error) {
      console.error('[DEBUG] Failed to fetch bookings:', error.message);
      throw new Error(error.message);
    }

    console.log('[DEBUG] Fetched bookings count:', data?.length ?? 0);
    return (data ?? []) as Booking[];
  },
};