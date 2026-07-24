export interface Center {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  city: string;
  address: string;
  open_time: string | null;
  close_time: string | null;
  image_url: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
}

export interface CenterService {
  id: string;
  center_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  on_duty_note?: string | null;
  created_at: string;
}
