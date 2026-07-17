import { supabase } from '../lib/supabase';
import { imageUploadService } from './imageUploadService';
import {
    CreateProfilePayload,
    UploadAvatarPayload,
    UpdateProfilePayload,
} from "../types/profile";

export async function getStaffContext() {
    const { data, error } = await supabase.rpc('get_my_staff_context');
    if (error) throw error;
    return data?.[0] as { role: string; is_doctor: boolean; doctor_id: string | null } | null;
}

export const profileService = {
    async getProfileById(userId: string) {
        if (__DEV__) console.log('[profileService.getProfileById] userId:', userId);
        const result = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (__DEV__) console.log('[profileService.getProfileById] result:', { data: result.data, error: result.error?.message });
        return result;
    },

    async getStaffContext() {
        return getStaffContext();
    },
    
    async createProfile(payload: CreateProfilePayload) {
        const insertPayload = {
            ...payload,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (__DEV__) console.log('[profileService.createProfile] insert payload:', insertPayload);
        const result = await supabase
            .from('profiles')
            .insert(insertPayload)
            .select()
            .single();
        if (__DEV__) console.log('[profileService.createProfile] supabase result:', { data: result.data, error: result.error?.message, status: result.status });
        return result;
    },
    
    async updateProfile(userId: string, payload: UpdateProfilePayload) {
        if (__DEV__) console.log('[profileService.updateProfile] userId:', userId, 'payload:', payload);
        const result = await supabase
            .from('profiles')
            .update({
                ...payload,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .select()
            .single();
        if (__DEV__) console.log('[profileService.updateProfile] result:', { data: result.data, error: result.error?.message });
        return result;
    },

    async uploadAvatar(userId: string, payload: UploadAvatarPayload) {
        const result = await imageUploadService.uploadAvatar(userId, payload);

        if (!result.success) {
            return { data: null, error: new Error(result.error || 'Failed to upload avatar') };
        }

        return this.getProfileById(userId);
    },
}
