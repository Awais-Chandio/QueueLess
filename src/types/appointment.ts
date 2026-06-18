export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

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

  scheduled_at: string;

  status: AppointmentStatus;

  token_number: number | null;

  estimated_wait_mins: number | null;

  notes?: string | null;

  cancel_reason?: string | null;

  cancelled_by?: string | null;

  cancelled_at?: string | null;

  checked_in_at?: string | null;

  started_at?: string | null;

  completed_at?: string | null;

  created_at: string;
}

export interface AppointmentFull {
  id: string;
  user_id?: string;
  patient_name?: string | null;
  center_id: string;
  service_id: string;
  center_name?: string;
  service_name?: string;
  scheduled_at: string;
  status: AppointmentStatus;
  token_number?: number | null;
  estimated_wait_mins?: number | null;
  notes?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  checked_in_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  current_position?: number | null;
  people_ahead?: number | null;
  queue_status?: string | null;
  created_at?: string;
}
