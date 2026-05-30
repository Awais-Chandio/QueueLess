export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: string;

  user_id: string;

  center_id: string;

  service_id: string;

  scheduled_at: string;

  status: BookingStatus;

  created_at: string;

  center?: {
    id: string;
    name: string;
    city: string;
    address: string;
  } | null;

  service?: {
    id: string;
    name: string;
    duration_minutes: number;
    price: number;
  } | null;
}
