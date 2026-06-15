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

  estimated_wait_mins: number | null;

  notes?: string | null;

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
  estimated_wait_mins?: number | null;
  notes?: string | null;
  current_position?: number | null;
  people_ahead?: number | null;
  queue_status?: string | null;
  created_at?: string;
}
