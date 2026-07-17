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
  profile_id?: string | null;
  employee_code?: string | null;
  license_number?: string | null;
  gender?: string | null;
  fee?: number | null;
  status?: string | null;
  updated_at?: string;
  service_centers?: {
    id: string;
    name: string;
    city?: string;
    address?: string;
  } | null;
  doctor_services?: {
    service_id: string;
    services?: {
      id: string;
      name: string;
    } | null;
  }[] | null;
}

export interface DoctorAvailability {
  status: DoctorAvailabilityStatus;
  tokens_ahead: number;
  estimated_wait_minutes: number;
}
