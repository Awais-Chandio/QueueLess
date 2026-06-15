export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export interface Appointment {
  id: string;

  user_id: string;

  center_id: string;

  service_id: string;

  scheduled_at: string;

  status: AppointmentStatus;

  token_number: number | null;

  created_at: string;
}

export interface AppointmentFull {
  id: string;
  user_id?: string;
  center_id: string;
  service_id: string;
  center_name?: string;
  service_name?: string;
  scheduled_at: string;
  status: AppointmentStatus | string;
  token_number?: number | null;
  created_at?: string;
}
