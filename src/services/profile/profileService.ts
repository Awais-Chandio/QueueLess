import { supabase } from '../supabase/client';
import {
    CreateProfilePayload,
    UpdateProfilePayload,
} from "../../types/profile";

export const profileService = {

    async getProfile(userId: string) {
        return await supabase.from('profiles').select('*').eq('id', userId).single();

    },
    async createProfile(payload: CreateProfilePayload) {
        return await supabase
            .from('profiles')
            .upsert(payload)
            .select()
            .single();
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
