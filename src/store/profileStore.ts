import { create } from "zustand";
import { profileService } from "../features/profile/api/profileService";
import { CreateProfilePayload, UpdateProfilePayload, Profile, UploadAvatarPayload } from "../types/profile";

type ProfileState = {
    profile: Profile | null;
    isLoading: boolean;
    isUploadingAvatar: boolean;
    error: string | null;

    fetchProfile: (userId: string) => Promise<void>;
    createProfile: (payload: CreateProfilePayload) => Promise<void>;
    updateProfile: (userId: string, payload: UpdateProfilePayload) => Promise<void>;
    uploadAvatar: (userId: string, payload: UploadAvatarPayload) => Promise<void>;
    clearProfile: () => void;
}
export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    isLoading: false,
    isUploadingAvatar: false,
    error: null,
    fetchProfile: async (userId) => {
        if (__DEV__) console.log('[profileStore.fetchProfile] fetching for userId:', userId);
        set({ isLoading: true, error: null });
        try {
            const { data, error } = await profileService.getProfileById(userId);
            if (__DEV__) console.log('[profileStore.fetchProfile] result:', { data, error: error?.message });
            if (error) {
                set({ error: error.message, isLoading: false });
                return;
            }
            set({ profile: data, isLoading: false });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Network error while fetching profile';
            set({ error: message, isLoading: false });
        }
    },
    createProfile: async (payload) => {
        set({ isLoading: true, error: null });
        const { data, error } = await profileService.createProfile(payload);
        if (error) {
            set({ error: error.message, isLoading: false });
            return;
        }
        set({ profile: data, isLoading: false });
    },
    updateProfile: async (userId, payload) => {
        if (__DEV__) console.log('[profileStore.updateProfile] updating for userId:', userId);
        set({ isLoading: true, error: null });
        try {
            const { data, error } = await profileService.updateProfile(userId, payload);
            if (__DEV__) console.log('[profileStore.updateProfile] result:', { data, error: error?.message });
            if (error) {
                set({ error: error.message, isLoading: false });
                return;
            }
            // Use the data returned by the update directly — no second fetch needed.
            if (data) {
                set({ profile: data, isLoading: false });
            } else {
                // Fallback: re-fetch only if the update returned no data.
                await useProfileStore.getState().fetchProfile(userId);
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Network error while updating profile';
            set({ error: message, isLoading: false });
        }
    },
    uploadAvatar: async (userId, payload) => {
        set({ isUploadingAvatar: true, error: null });
        try {
            const { data, error } = await profileService.uploadAvatar(userId, payload);

            if (error) {
                set({ error: error.message, isUploadingAvatar: false });
                return;
            }

            // Use the data returned by the upload directly — no second fetch needed.
            if (data) {
                set({ profile: data, isUploadingAvatar: false });
            } else {
                // Fallback: re-fetch only if the upload returned no data.
                await useProfileStore.getState().fetchProfile(userId);
                set({ isUploadingAvatar: false });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Network error while uploading avatar';
            set({ error: message, isUploadingAvatar: false });
        }
    },
    clearProfile: () => {
        set({ profile: null, isLoading: false, isUploadingAvatar: false, error: null });
    },
}));
