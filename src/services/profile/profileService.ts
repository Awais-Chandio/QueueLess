import { supabase } from '../supabase/client';
import {
    CreateProfilePayload,
    UpdateProfilePayload,
} from "../../types/profile";

export const profileService = {

    async getProfileById(userId: string) {
        return await supabase.from('profiles').select('*').eq('id', userId).single();

    },
    async createProfile(payload: CreateProfilePayload) {
        const insertPayload = {
            ...payload,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        console.log('[profileService.createProfile] insert payload:', insertPayload);
        const result = await supabase
            .from('profiles')
            .insert(insertPayload)
            .select()
            .single();
        console.log('[profileService.createProfile] supabase result:', { data: result.data, error: result.error?.message, status: result.status });
        return result;
    },
    async updateProfile(userId: string, payload: UpdateProfilePayload) {
        return await supabase
            .from('profiles')
            .update({
                ...payload,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .select()
            .single();
    },

}
