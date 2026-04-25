import { supabase } from '../supabase/client';
import {
    CreateProfilePayload,
    UpdateProfilePayload, Profile
} from "../../types/profile";

export const profileService = {

    async getProfile(userId: string) {
        await supabase.from('profiles').select('*').eq('id', userId).single();

    },
    async createProfile(payload: CreateProfilePayload) {
        return await supabase
            .from('profiles')
            .insert(payload)
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
