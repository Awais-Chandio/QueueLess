export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export interface Booking {
id: string;

  user_id: string;

  center_id: string;

  service_id: string;

  booking_date: string;

  booking_time: string;

  status: BookingStatus;

  queue_number?: number | null;

  created_at: string;

}
