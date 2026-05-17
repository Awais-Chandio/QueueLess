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

  async getUserBookings(userId: string): Promise<Booking[]> {
    const { data, error } = await supabase
      .from("bookings")
      .select()
      .eq("user_id", userId)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Booking[];
  },
};
