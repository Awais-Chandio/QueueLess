import { create } from "zustand";
import { profileService } from "../features/profile/api/profileService";
import { CreateProfilePayload, UpdateProfilePayload, Profile } from "../types/profile";

type ProfileState = {
    profile: Profile | null;
    isLoading: boolean;
    error: string | null;

    fetchProfile: (userId: string) => Promise<void>;
    createProfile: (payload: CreateProfilePayload) => Promise<void>;
    updateProfile: (userId: string, payload: UpdateProfilePayload) => Promise<void>;
    clearProfile: () => void;
}
export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    isLoading: false,
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
            // Refresh profile from DB to ensure store is in sync
            await useProfileStore.getState().fetchProfile(userId);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Network error while updating profile';
            set({ error: message, isLoading: false });
        }
    },
    clearProfile: () => {
        set({ profile: null, isLoading: false, error: null });
    },
}));
