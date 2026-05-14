export interface Center {
  id: string;
  name: string;
  description: string | null;
  city: string;
  address: string;
  image_url: string | null;
  created_at: string;
}

export interface CenterService {
  id: string;
  center_id: string;

  name: string;
  description: string | null;

  duration_minutes: number;
  price: number | null;

  created_at: string;
}