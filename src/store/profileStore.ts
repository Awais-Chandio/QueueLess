import { create } from "zustand";
import { profileService } from "../services/profile/profileService";
import { CreateProfilePayload, UpdateProfilePayload,Profile } from "../types/profile";

type ProfileState = {
    profile:Profile | null;
    loading: boolean;
    error: string | null;

    fetchProfile: (userId: string) => Promise<void>;
    createProfile: (payload: CreateProfilePayload) => Promise<void>;
    updateProfile: (userId: string, payload: UpdateProfilePayload) => Promise<void>;
}
export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    loading: false,
    error: null,
    fetchProfile: async (userId) => {
        set({ loading: true, error: null });
        const { data, error } = await profileService.getProfile(userId);
        if (error) {
            set({ error: error.message, loading: false });
            return
        } 
        set({ profile: data, loading: false });
    },
    createProfile: async (payload) => {
        set({ loading: true, error: null });
        const { data, error } = await profileService.createProfile(payload);
        if (error) {
            set({ error: error.message, loading: false });
            return;
        }
        set({ profile: data, loading: false });
    },
    updateProfile: async (userId, payload) => {
        set({ loading: true, error: null });
        const { data, error } = await profileService.updateProfile(userId, payload);
        if (error) {
            set({ error: error.message, loading: false });
            return;
        }
        set({ profile: data, loading: false });

        },
        clearProfile: () => {
    set({ profile: null, loading: false, error: null });
    },
    }));
