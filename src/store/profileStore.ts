import { create } from "zustand";
import { profileService } from "../services/profile/profileService";
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
        set({ isLoading: true, error: null });
        const { data, error } = await profileService.getProfileById(userId);
        if (error) {
            set({ error: error.message, isLoading: false });
            return;
        }
        set({ profile: data, isLoading: false });
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
        set({ isLoading: true, error: null });
        const { data, error } = await profileService.updateProfile(userId, payload);
        if (error) {
            set({ error: error.message, isLoading: false });
            return;
        }
        set({ profile: data, isLoading: false });
    },
    clearProfile: () => {
        set({ profile: null, isLoading: false, error: null });
    },
}));
