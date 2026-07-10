import { supabase } from '../lib/supabase';
import { base64ToArrayBuffer } from './imageUploadService';

export interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  photo_url: string | null;
  service_id: string;
  is_active: boolean;
  created_at: string;
}

export interface DoctorPayload {
  name: string;
  specialization?: string;
  photo_url?: string | null;
  service_id: string;
  is_active?: boolean;
}

export const doctorService = {
  /** Fetch all doctors for a given service (active only by default) */
  async getByServiceId(serviceId: string, activeOnly = true): Promise<Doctor[]> {
    let query = supabase
      .from('doctors')
      .select('id, name, specialization, photo_url, service_id, is_active, created_at')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Fetch all doctors for a service (admin view, includes inactive) */
  async getAllByServiceId(serviceId: string): Promise<Doctor[]> {
    return this.getByServiceId(serviceId, false);
  },

  /** Create a new doctor */
  async create(payload: DoctorPayload): Promise<Doctor> {
    const { data, error } = await supabase
      .from('doctors')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Update an existing doctor */
  async update(doctorId: string, payload: Partial<DoctorPayload>): Promise<Doctor> {
    const { data, error } = await supabase
      .from('doctors')
      .update(payload)
      .eq('id', doctorId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Toggle is_active */
  async toggleActive(doctorId: string, isActive: boolean): Promise<Doctor> {
    return this.update(doctorId, { is_active: isActive });
  },

  /** Delete a doctor */
  async delete(doctorId: string): Promise<void> {
    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', doctorId);
    if (error) throw new Error(error.message);
  },

  /**
   * Upload a doctor photo to Supabase Storage and return the public URL.
   * Uses the same base64 → ArrayBuffer pattern as imageUploadService.
   */
  async uploadPhoto(
    doctorId: string,
    base64: string,
    mimeType = 'image/jpeg',
  ): Promise<string> {
    const fileBody = base64ToArrayBuffer(base64);
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const path = `doctors/${doctorId}/photo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, fileBody, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  },
};
