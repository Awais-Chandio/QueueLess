import { supabase } from '../lib/supabase';
import { base64ToArrayBuffer } from './imageUploadService';
import { accountService } from '../features/admin/api/accountService';

const STORAGE_UPLOAD_TIMEOUT_MS = 15_000;
const STORAGE_VERIFY_TIMEOUT_MS = 10_000;
const DATABASE_WRITE_TIMEOUT_MS = 15_000;
const DATABASE_VERIFY_TIMEOUT_MS = 10_000;

const withTimeout = <T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise).then(
      value => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

const updateDoctorRow = async (doctorId: string, changes: Record<string, unknown>): Promise<Doctor> => {
  let writeFailure: unknown = null;

  try {
    const { error } = await withTimeout(supabase.from('doctors').update(changes).eq('id', doctorId), DATABASE_WRITE_TIMEOUT_MS, 'Doctor update response timed out.');
    if (error) throw new Error(error.message);
  } catch (error) {
    writeFailure = error;
    console.warn('[doctorService] Doctor update response failed/timed out; verifying row.', error);
  }

  const { data, error: verifyError } = await withTimeout(supabase.from('doctors').select('*').eq('id', doctorId).single(), DATABASE_VERIFY_TIMEOUT_MS, 'Doctor row verification timed out.');
  if (verifyError || !data) {
    throw new Error(verifyError?.message || (writeFailure instanceof Error ? writeFailure.message : 'Doctor update could not be verified.'));
  }

  const mismatchedKey = Object.keys(changes).find(key => data[key] !== changes[key]);
  if (mismatchedKey) {
    throw new Error(writeFailure instanceof Error ? writeFailure.message : `Doctor update verification failed for ${mismatchedKey}.`);
  }

  if (__DEV__) {
    console.log('[doctorService] Doctor row update verified', { doctorId });
  }
  return data as Doctor;
};

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
  doctor_services?:
    | {
    service_id: string;
    services?: {
      id: string;
      name: string;
    } | null;
      }[]
    | null;
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
    let query = supabase.from('doctors').select('id, name, specialization, photo_url, service_id, is_active, created_at').eq('service_id', serviceId).order('created_at', { ascending: true });

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
    const { data, error } = await supabase.from('doctors').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data as any as Doctor;
  },

  /** Update an existing doctor */
  async update(doctorId: string, payload: Partial<DoctorPayload>): Promise<Doctor> {
    const { data, error } = await supabase.from('doctors').update(payload).eq('id', doctorId).select().single();
    if (error) throw new Error(error.message);
    return data as any as Doctor;
  },

  /** Toggle is_active */
  async toggleActive(doctorId: string, isActive: boolean): Promise<Doctor> {
    return this.update(doctorId, { is_active: isActive });
  },

  /** Delete a doctor */
  async delete(doctorId: string): Promise<void> {
    const { error } = await supabase.from('doctors').delete().eq('id', doctorId);
    if (error) throw new Error(error.message);
  },

  /**
   * Upload a doctor photo to Supabase Storage and return the public URL.
   * Uses the same base64 → ArrayBuffer pattern as imageUploadService.
   */
  async uploadPhoto(doctorId: string, base64: string, mimeType = 'image/jpeg'): Promise<string> {
    const fileBody = base64ToArrayBuffer(base64);
    if (__DEV__) {
      console.log('[doctorService] Doctor photo prepared for Storage', {
        hasBase64: Boolean(base64),
        base64Length: base64.length,
        uploadBytes: fileBody.byteLength,
        mimeType,
      });
    }
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const path = `doctors/${doctorId}/photo.${ext}`;

    try {
      const { error: uploadError } = await withTimeout(
        supabase.storage.from('avatars').upload(path, fileBody, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
        }),
        STORAGE_UPLOAD_TIMEOUT_MS,
        'Doctor photo upload response timed out.',
      );

    if (uploadError) throw new Error(uploadError.message);
    } catch (uploadError) {
      // React Native can occasionally receive no completion callback even though
      // Storage committed the object. Verify the exact path before failing.
      console.warn('[doctorService] Upload response failed/timed out; verifying Storage object.', uploadError);
      const directory = path.slice(0, path.lastIndexOf('/'));
      const fileName = path.slice(path.lastIndexOf('/') + 1);
      const { data: storedFiles, error: verifyError } = await withTimeout(
        supabase.storage.from('avatars').list(directory, {
          limit: 10,
          search: fileName,
        }),
        STORAGE_VERIFY_TIMEOUT_MS,
        'Doctor photo Storage verification timed out.',
      );
      const uploadedFile = storedFiles?.find(file => file.name === fileName);
      if (verifyError || !uploadedFile) {
        throw new Error(verifyError?.message || (uploadError instanceof Error ? uploadError.message : 'Doctor photo upload failed.'));
      }
    }

    if (__DEV__) {
      console.log('[doctorService] Doctor photo confirmed in Storage', { path });
    }
 
     const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Supabase Storage did not return a public photo URL.');
     return `${data.publicUrl}?v=${Date.now()}`;
   },
 
   /** Fetch all doctors with their centers and services mapped */
   async getAllDoctors(): Promise<Doctor[]> {
     const { data, error } = await supabase
       .from('doctors')
      .select(
        `
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
       `,
      )
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
       .select(
         `
          *,
          profiles (
            id,
            email,
            phone
          ),
          service_centers (
            id,
            name,
            city,
            address
          ),
          doctor_services (
            service_id,
            services (
              id,
              name
            )
          )
        `,
       )
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
    specialty?: string;
     status: 'active' | 'inactive';
     avatarBase64?: string | null;
     avatarMimeType?: string;
   }): Promise<Doctor> {
    // 1. Try calling the atomic RPC first
    const generatedPassword = payload.password || Math.random().toString(36).slice(-10) + 'A1!';
    let atomicUserId: string | null = null;
    let atomicRpcError: string | null = null;

    try {
      console.log('[doctorService] Attempting to create doctor via atomic RPC');
      const { data: newUserId, error: rpcError } = await supabase.rpc('create_doctor_with_account', {
        p_email: payload.email,
        p_password: generatedPassword,
        p_full_name: payload.name,
        p_center_id: payload.centerId,
        p_specialty: payload.specialty || 'General Physician',
        p_qualification: payload.qualification,
        p_experience_years: payload.experienceYears,
        p_service_ids: payload.serviceIds,
      });
      atomicUserId = !rpcError && newUserId ? String(newUserId) : null;
      atomicRpcError = rpcError?.message ?? null;
    } catch (err) {
      atomicRpcError = err instanceof Error ? err.message : String(err);
    }

    if (atomicUserId) {
      console.log('[doctorService] Atomic RPC succeeded. Fetching doctor details.');
      const { data: docData, error: fetchDoctorError } = await supabase.from('doctors').select('*').eq('profile_id', atomicUserId).single();
      if (fetchDoctorError || !docData) {
        throw new Error(fetchDoctorError?.message || 'Doctor account created, but doctor profile was not found.');
      }

      const photoUrl = payload.avatarBase64 ? await this.uploadPhoto(docData.id, payload.avatarBase64, payload.avatarMimeType) : docData.photo_url;

      const updatedDoctor = await updateDoctorRow(docData.id, {
        center_id: payload.centerId,
        name: payload.name,
        specialty: payload.specialty || 'General Physician',
        qualification: payload.qualification,
        experience_years: payload.experienceYears,
        employee_code: payload.employeeCode,
        license_number: payload.licenseNumber,
        gender: payload.gender,
        fee: payload.fee,
        status: payload.status,
        is_active: payload.status === 'active',
        photo_url: photoUrl,
      });

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          phone: payload.phone,
          ...(photoUrl ? { avatar_url: photoUrl } : {}),
        })
        .eq('id', atomicUserId);
      if (profileError) {
        throw new Error(`Doctor created, but linked profile update failed: ${profileError.message}`);
      }
      return updatedDoctor as Doctor;
    }

    console.warn('[doctorService] Atomic RPC skipped or failed, falling back to multi-step creation:', atomicRpcError);

    // Fallback: Multi-step creation with explicit checks to avoid silent/partial failures
     const managedAccount = await accountService.createManagedAccount({
       name: payload.name,
       email: payload.email,
       password: payload.password,
      role: 'doctor',
       centerId: payload.centerId,
     });
 
     const userId = managedAccount.userId;
    if (!userId) {
      throw new Error('Failed to create managed account.');
    }
 
     // 2. Update profile phone number
     try {
      await supabase.from('profiles').update({ phone: payload.phone }).eq('id', userId);
     } catch (profileError) {
       console.warn('Failed to update phone number in profiles:', profileError);
     }
 
     // 3. Create doctor entry in doctors table
     let { data: doctor, error: doctorError } = await supabase
       .from('doctors')
       .insert({
         center_id: payload.centerId,
         name: payload.name,
        specialty: payload.specialty || 'General Physician',
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
 
    if (doctorError) {
      throw new Error(`Doctor account created, but doctor profile setup failed: ${doctorError.message}`);
    }
    if (!doctor) {
      throw new Error('Doctor account created, but doctor profile setup failed (no doctor returned).');
    }
 
     // 4. Handle avatar photo upload if provided
     if (payload.avatarBase64) {
         const photoUrl = await this.uploadPhoto(doctor.id, payload.avatarBase64, payload.avatarMimeType);
         
      doctor = await updateDoctorRow(doctor.id, { photo_url: photoUrl });
 
      const { error: avatarProfileError } = await supabase.from('profiles').update({ avatar_url: photoUrl }).eq('id', userId);
      if (avatarProfileError) {
        throw new Error(`Doctor photo saved, but profile avatar update failed: ${avatarProfileError.message}`);
       }
     }
 
     // 5. Create service mapping records
     if (payload.serviceIds && payload.serviceIds.length > 0) {
       const mappings = payload.serviceIds.map(sid => ({
         doctor_id: doctor.id,
         service_id: sid,
       }));
      const { error: mappingError } = await supabase.from('doctor_services').insert(mappings);
       if (mappingError) {
        throw new Error(`Doctor account created, but service assignment failed: ${mappingError.message}`);
       }
     }
 
     // 6. Create default doctor queue settings
    const { error: queueSettingsError } = await supabase.from('doctor_queue_settings').insert({
         doctor_id: doctor.id,
         current_token: 0,
         average_consultation_time: 10.0,
         is_on_break: false,
       });
     if (queueSettingsError) {
      throw new Error(`Doctor account created, but queue settings generation failed: ${queueSettingsError.message}`);
     }

     // 7. Create default weekly schedules (Monday to Saturday, day_of_week 1 to 6)
      const defaultSchedules = [];
      for (let day = 1; day <= 6; day++) {
        defaultSchedules.push({
          doctor_id: doctor.id,
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '17:00:00',
          max_tokens_per_day: 40,
        });
      }
      const { error: scheduleError } = await supabase.from('doctor_schedules').insert(defaultSchedules);
      if (scheduleError) {
        console.warn('[doctorService] Fallback setup: failed to insert default doctor schedules:', scheduleError);
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
      employeeCode: string;
       fee: number;
       centerId: string;
       serviceIds: string[];
       status: 'active' | 'inactive';
       avatarBase64?: string | null;
       avatarMimeType?: string;
       profileId?: string | null;
       photoUrl?: string | null;
    },
   ): Promise<Doctor> {
    // Upload first so photo_url is part of the same doctors update payload.
    const photoUrl = payload.avatarBase64 ? await this.uploadPhoto(doctorId, payload.avatarBase64, payload.avatarMimeType) : payload.photoUrl;

     // 1. Update doctor entry
    const doctor = await updateDoctorRow(doctorId, {
         center_id: payload.centerId,
         name: payload.name,
         qualification: payload.qualification,
         experience_years: payload.experienceYears,
         is_active: payload.status === 'active',
      employee_code: payload.employeeCode,
         license_number: payload.licenseNumber,
         gender: payload.gender,
         fee: payload.fee,
         status: payload.status,
      photo_url: photoUrl,
    });
 
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
 
    // 3. Keep the linked profile avatar in sync with the doctor photo.
    if (payload.profileId && payload.avatarBase64 && photoUrl) {
      const { error: avatarProfileError } = await supabase.from('profiles').update({ avatar_url: photoUrl }).eq('id', payload.profileId);
      if (avatarProfileError) {
        throw new Error(`Doctor photo saved, but profile avatar update failed: ${avatarProfileError.message}`);
       }
     }
 
     // 4. Update service mappings (delete and recreate)
    const { error: deleteError } = await supabase.from('doctor_services').delete().eq('doctor_id', doctorId);
 
     if (deleteError) {
       console.warn('Failed to delete old services mappings:', deleteError);
     }
 
     if (payload.serviceIds && payload.serviceIds.length > 0) {
       const mappings = payload.serviceIds.map(sid => ({
         doctor_id: doctorId,
         service_id: sid,
       }));
      const { error: mappingError } = await supabase.from('doctor_services').insert(mappings);
       if (mappingError) {
         console.warn('Failed to insert new doctor services mappings:', mappingError);
       }
     }
 
     return doctor as Doctor;
   },
 };
