export type DoctorAvailabilityStatus =
  | 'available'
  | 'busy'
  | 'on_break'
  | 'on_leave'
  | 'not_working'
  | 'fully_booked';

export interface Doctor {
  id: string;
  center_id: string;
  name: string;
  specialty: string;
  qualification: string | null;
  experience_years: number;
  photo_url: string | null;
  bio: string | null;
  is_active: boolean;
  is_on_break: boolean;
  created_at: string;
}

export interface DoctorAvailability {
  status: DoctorAvailabilityStatus;
  tokens_ahead: number;
  estimated_wait_minutes: number;
}
