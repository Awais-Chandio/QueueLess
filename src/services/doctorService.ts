import { supabase } from '../lib/supabase';
import { base64ToArrayBuffer } from './imageUploadService';
import { accountService } from '../features/admin/api/accountService';

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
  } | null;
  doctor_services?: {
    service_id: string;
    services?: {
      id: string;
      name: string;
    } | null;
  }[] | null;
  specialization?: string | null; // For backward compatibility
  service_id?: string; // For backward compatibility
}

export interface DoctorPayload {
  name: string;
  center_id?: string;
  specialty?: string;
  qualification?: string | null;
  experience_years?: number;
  photo_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
  profile_id?: string | null;
  employee_code?: string | null;
  license_number?: string | null;
  gender?: string | null;
  fee?: number | null;
  status?: string | null;
  specialization?: string; // For backward compatibility
  service_id?: string; // For backward compatibility
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
    return (data ?? []) as any as Doctor[];
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
    return data as any as Doctor;
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
    return data as any as Doctor;
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
 
   /** Fetch all doctors with their centers and services mapped */
   async getAllDoctors(): Promise<Doctor[]> {
     const { data, error } = await supabase
       .from('doctors')
       .select(`
         *,
         service_centers (
           id,
           name
         ),
         doctor_services (
           service_id,
           services (
             id,
             name
           )
         )
       `)
       .order('created_at', { ascending: false });
 
     if (error) throw new Error(error.message);
     return (data ?? []).map(d => ({
       ...d,
       specialization: d.specialty || '', // backward compatibility
     })) as Doctor[];
   },
 
   /** Fetch single doctor by ID with profiles join and doctor services */
   async getDoctorById(id: string): Promise<any> {
     const { data, error } = await supabase
       .from('doctors')
       .select(`
         *,
         profiles (
           id,
           email,
           phone
         ),
         doctor_services (
           service_id
         )
       `)
       .eq('id', id)
       .single();
 
     if (error) throw new Error(error.message);
     return data;
   },
 
   /** Create a doctor profile and linked account */
   async createDoctor(payload: {
     name: string;
     email: string;
     phone: string;
     password?: string;
     gender: string;
     qualification: string;
     experienceYears: number;
     licenseNumber: string;
     employeeCode: string;
     fee: number;
     centerId: string;
     serviceIds: string[];
     status: 'active' | 'inactive';
     avatarBase64?: string | null;
     avatarMimeType?: string;
   }): Promise<Doctor> {
     // 1. Create authentication/profile account
     const managedAccount = await accountService.createManagedAccount({
       name: payload.name,
       email: payload.email,
       password: payload.password,
       role: 'staff',
       centerId: payload.centerId,
     });
 
     const userId = managedAccount.userId;
 
     // 2. Update profile phone number
     try {
       await supabase
         .from('profiles')
         .update({ phone: payload.phone })
         .eq('id', userId);
     } catch (profileError) {
       console.warn('Failed to update phone number in profiles:', profileError);
     }
 
     // 3. Create doctor entry in doctors table
     let { data: doctor, error: doctorError } = await supabase
       .from('doctors')
       .insert({
         center_id: payload.centerId,
         name: payload.name,
         specialty: 'General Physician',
         qualification: payload.qualification,
         experience_years: payload.experienceYears,
         bio: `${payload.name} is a qualified specialist with ${payload.experienceYears} years of experience.`,
         is_active: payload.status === 'active',
         is_on_break: false,
         profile_id: userId,
         employee_code: payload.employeeCode,
         license_number: payload.licenseNumber,
         gender: payload.gender,
         fee: payload.fee,
         status: payload.status,
       })
       .select()
       .single();
 
     if (doctorError) throw new Error(doctorError.message);
     if (!doctor) throw new Error('Doctor creation failed.');
 
     // 4. Handle avatar photo upload if provided
     if (payload.avatarBase64) {
       try {
         const photoUrl = await this.uploadPhoto(doctor.id, payload.avatarBase64, payload.avatarMimeType);
         
         const { data: updatedDoc, error: updateErr } = await supabase
           .from('doctors')
           .update({ photo_url: photoUrl })
           .eq('id', doctor.id)
           .select()
           .single();
           
         if (!updateErr && updatedDoc) {
           doctor = updatedDoc;
         }
 
         await supabase
           .from('profiles')
           .update({ avatar_url: photoUrl })
           .eq('id', userId);
       } catch (uploadError) {
         console.warn('Avatar photo upload failed:', uploadError);
       }
     }
 
     // 5. Create service mapping records
     if (payload.serviceIds && payload.serviceIds.length > 0) {
       const mappings = payload.serviceIds.map(sid => ({
         doctor_id: doctor.id,
         service_id: sid,
       }));
       const { error: mappingError } = await supabase
         .from('doctor_services')
         .insert(mappings);
       if (mappingError) {
         console.warn('Failed to insert doctor services mappings:', mappingError);
       }
     }
 
     // 6. Create default doctor queue settings
     const { error: queueSettingsError } = await supabase
       .from('doctor_queue_settings')
       .insert({
         doctor_id: doctor.id,
         current_token: 0,
         average_consultation_time: 10.0,
         is_on_break: false,
       });
     if (queueSettingsError) {
       console.warn('Failed to create doctor queue settings:', queueSettingsError);
     }
 
     return doctor as Doctor;
   },
 
   /** Update a doctor profile and linked services mapping */
   async updateDoctor(
     doctorId: string,
     payload: {
       name: string;
       phone: string;
       gender: string;
       qualification: string;
       experienceYears: number;
       licenseNumber: string;
       fee: number;
       centerId: string;
       serviceIds: string[];
       status: 'active' | 'inactive';
       avatarBase64?: string | null;
       avatarMimeType?: string;
       profileId?: string | null;
       photoUrl?: string | null;
     }
   ): Promise<Doctor> {
     // 1. Update doctor entry
     let { data: doctor, error: doctorError } = await supabase
       .from('doctors')
       .update({
         center_id: payload.centerId,
         name: payload.name,
         qualification: payload.qualification,
         experience_years: payload.experienceYears,
         is_active: payload.status === 'active',
         license_number: payload.licenseNumber,
         gender: payload.gender,
         fee: payload.fee,
         status: payload.status,
       })
       .eq('id', doctorId)
       .select()
       .single();
 
     if (doctorError) throw new Error(doctorError.message);
     if (!doctor) throw new Error('Doctor not found.');
 
     // 2. Update profile phone & name if linked
     if (payload.profileId) {
       try {
         await supabase
           .from('profiles')
           .update({
             full_name: payload.name,
             phone: payload.phone,
           })
           .eq('id', payload.profileId);
       } catch (profileError) {
         console.warn('Failed to update phone number in profiles:', profileError);
       }
     }
 
     // 3. Handle avatar photo upload if provided
     if (payload.avatarBase64) {
       try {
         const photoUrl = await this.uploadPhoto(doctor.id, payload.avatarBase64, payload.avatarMimeType);
         
         const { data: updatedDoc, error: updateErr } = await supabase
           .from('doctors')
           .update({ photo_url: photoUrl })
           .eq('id', doctor.id)
           .select()
           .single();
           
         if (!updateErr && updatedDoc) {
           doctor = updatedDoc;
         }
 
         if (payload.profileId) {
           await supabase
             .from('profiles')
             .update({ avatar_url: photoUrl })
             .eq('id', payload.profileId);
         }
       } catch (uploadError) {
         console.warn('Avatar photo upload failed:', uploadError);
       }
     }
 
     // 4. Update service mappings (delete and recreate)
     const { error: deleteError } = await supabase
       .from('doctor_services')
       .delete()
       .eq('doctor_id', doctorId);
 
     if (deleteError) {
       console.warn('Failed to delete old services mappings:', deleteError);
     }
 
     if (payload.serviceIds && payload.serviceIds.length > 0) {
       const mappings = payload.serviceIds.map(sid => ({
         doctor_id: doctorId,
         service_id: sid,
       }));
       const { error: mappingError } = await supabase
         .from('doctor_services')
         .insert(mappings);
       if (mappingError) {
         console.warn('Failed to insert new doctor services mappings:', mappingError);
       }
     }
 
     return doctor as Doctor;
   },
 };
