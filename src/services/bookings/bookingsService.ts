import { supabase } from "../supabase/client";
import { Booking } from "../../types/booking";

type CreateBookingPayload = {
  user_id: string;
  center_id: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
};

export const bookingsService = {
  async createBooking(
    payload: CreateBookingPayload
  ): Promise<Booking> {
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        ...payload,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as Booking;
  },
};