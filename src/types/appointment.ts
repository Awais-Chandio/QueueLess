export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'called'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show'
  | 'skipped';

export type CancelReason =
  | 'Patient Requested'
  | 'No Show'
  | 'Duplicate Booking'
  | 'Center Closed'
  | 'Other';

export interface Appointment {
  id: string;

  user_id: string;

  center_id: string;

  service_id: string;

  doctor_id?: string | null;

  scheduled_at: string;

  appointment_date?: string | null;

  appointment_time?: string | null;

  status: AppointmentStatus;

  token_number: number | null;

  estimated_wait_mins: number | null;

  notes?: string | null;

  cancel_reason?: string | null;

  cancelled_by?: string | null;

  cancelled_at?: string | null;

  checked_in_at?: string | null;

  called_at?: string | null;

  started_at?: string | null;

  completed_at?: string | null;

  skipped_at?: string | null;

  duration_minutes?: number | null;

  created_at: string;
}

export interface AppointmentFull {
  id: string;
  user_id?: string;
  patient_name?: string | null;
  center_id: string;
  service_id: string;
  doctor_id?: string | null;
  center_name?: string;
  service_name?: string;
  scheduled_at: string;
  appointment_date?: string | null;
  appointment_time?: string | null;
  status: AppointmentStatus;
  token_number?: number | null;
  estimated_wait_mins?: number | null;
  notes?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  checked_in_at?: string | null;
  called_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  skipped_at?: string | null;
  duration_minutes?: number | null;
  current_position?: number | null;
  queue_position?: number | null;
  people_ahead?: number | null;
  queue_status?: string | null;
  current_serving_token?: number | null;
  current_token?: number | null;
  estimated_wait_time?: number | null;
  doctor_average_time?: number | null;
  average_consultation_time?: number | null;
  is_on_break?: boolean | null;
  break_start?: string | null;
  break_end?: string | null;
  created_at?: string;
}
