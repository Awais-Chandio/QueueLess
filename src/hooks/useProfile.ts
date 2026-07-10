import { useProfileStore } from '../stores/profileStore';

export const useProfile = () => {
  const {
    profile,
    isLoading,
    isUploadingAvatar,
    error,
    fetchProfile,
    createProfile,
    updateProfile,
    uploadAvatar,
    clearProfile,
  } = useProfileStore();

  return {
    profile,
    isLoading,
    isUploadingAvatar,
    error,
    fetchProfile,
    createProfile,
    updateProfile,
    uploadAvatar,
    clearProfile,
  };
};
