export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role?: 'client' | 'staff' | 'admin' | null;
  center_id?: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateProfilePayload = {
  id: string;
  full_name: string;
  email: string;
  role?: 'client' | 'staff' | 'admin';
  center_id?: string | null;
  phone?: string;
  avatar_url?: string;
};

export type UpdateProfilePayload = {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string;
};

export type UploadAvatarPayload = {
  uri: string;
  fileName?: string | null;
  type?: string | null;
  base64?: string | null;
};

export type CreateManagedAccountPayload = {
  name: string;
  email: string;
  password?: string;
  role: 'staff' | 'admin';
  centerId?: string;
};
