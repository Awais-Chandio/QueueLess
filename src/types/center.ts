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

// The clinic cards already have everything the details screen needs to paint
// its first frame. `created_at` is intentionally optional because nearby
// queries do not select it.
export type CenterPreview = Omit<Center, 'created_at'> & {
  created_at?: string;
};

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
