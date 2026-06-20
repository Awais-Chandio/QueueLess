import { supabase } from '../../../lib/supabase';
import {
    CreateProfilePayload,
    UploadAvatarPayload,
    UpdateProfilePayload,
} from "../../../types/profile";

const AVATAR_BUCKET = 'avatars';

const getAvatarExtension = (payload: UploadAvatarPayload) => {
    if (payload.fileName?.includes('.')) {
        return payload.fileName.split('.').pop()?.toLowerCase() || 'jpg';
    }

    if (payload.type?.includes('/')) {
        return payload.type.split('/').pop()?.toLowerCase() || 'jpg';
    }

    return 'jpg';
};

export const profileService = {

    async getProfileById(userId: string) {
        if (__DEV__) console.log('[profileService.getProfileById] userId:', userId);
        const result = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (__DEV__) console.log('[profileService.getProfileById] result:', { data: result.data, error: result.error?.message });
        return result;
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
        const extension = getAvatarExtension(payload);
        const contentType = payload.type || `image/${extension}`;
        const path = `${userId}/avatar.${extension}`;
        const response = await fetch(payload.uri);
        const blob = await response.blob();

        const uploadResult = await supabase.storage
            .from(AVATAR_BUCKET)
            .upload(path, blob, {
                cacheControl: '3600',
                contentType,
                upsert: true,
            });

        if (uploadResult.error) {
            return { data: null, error: uploadResult.error };
        }

        const { data } = supabase.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(path);

        const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
        return this.updateProfile(userId, { avatar_url: publicUrl });
    },

}
