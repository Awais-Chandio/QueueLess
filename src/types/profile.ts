export type Profile = {

id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateProfilePayload = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
};

export type UpdateProfilePayload = {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
};