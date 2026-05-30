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
    const insertPayload = {
      user_id: payload.user_id,
      center_id: payload.center_id,
      service_id: payload.service_id,
      scheduled_at: new Date(payload.scheduled_at).toISOString(),
    };

    console.log('[DEBUG] Creating booking with payload:', insertPayload);
    
    const { data, error } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select('id, user_id, center_id, service_id, scheduled_at, status, created_at')
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
      .select(
        `
          id,
          user_id,
          center_id,
          service_id,
          scheduled_at,
          status,
          created_at
        `,
      )
      .eq('user_id', userId)
      .order('scheduled_at', {
        ascending: true,
      });

    if (error) {
      console.error('[DEBUG] Failed to fetch bookings:', error.message);
      throw new Error(error.message);
    }

    const bookings = await Promise.all(
      (data ?? []).map(async (booking) => {
        const [centerResult, serviceResult] = await Promise.all([
          supabase
            .from('centers')
            .select('id, name, city, address')
            .eq('id', booking.center_id)
            .maybeSingle(),
          supabase
            .from('center_services')
            .select('id, name, duration_minutes, price')
            .eq('id', booking.service_id)
            .maybeSingle(),
        ]);

        if (centerResult.error) {
          console.error(
            '[DEBUG] Failed to fetch booking center:',
            centerResult.error.message,
          );
        }

        if (serviceResult.error) {
          console.error(
            '[DEBUG] Failed to fetch booking service:',
            serviceResult.error.message,
          );
        }

        return {
          ...booking,
          center: centerResult.data ?? null,
          service: serviceResult.data ?? null,
        };
      }),
    );

    console.log('[DEBUG] Fetched bookings count:', bookings.length);
    return bookings as Booking[];
  },
};
