import React, { useEffect } from "react";
import { View, StyleSheet, Text, Pressable, Platform } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import { launchImageLibrary } from "react-native-image-picker";
import { Camera, ChevronLeft } from "lucide-react-native";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import Loader from "../../../components/ui/Loader";
import ErrorState from "../../../components/ui/ErrorState";
import ProfileAvatar from "../../../components/ui/ProfileAvatar";
import { useAuth } from "../../../hooks/useAuth";
import { useProfileStore } from "../../../store/profileStore";
import { useToastStore } from "../../../store/toastStore";
import { profileSchema, type ProfileFormData } from "../../../validations/profileSchema";
import { useTheme } from "../../../hooks/useTheme";
import { scaleFont, wp, hp } from "../../../utils/responsive";

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { profile, isLoading, isUploadingAvatar, error, fetchProfile, updateProfile, uploadAvatar } =
    useProfileStore();
  const { colors, spacing, typography, radius } = useTheme();
  const { showToast } = useToastStore();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
      });
    } else if (user?.id) {
      fetchProfile(user.id);
    }
  }, [profile, user?.id, reset, fetchProfile]);

  const handleAvatarUpload = async () => {
    if (!user?.id || isUploadingAvatar) return;

    let result;

    try {
      result = await launchImageLibrary({
        mediaType: "photo",
        includeBase64: true,
        quality: 0.8,
        selectionLimit: 1,
      });
    } catch (pickerError) {
      const message =
        pickerError instanceof TypeError
          ? "Image picker is not linked yet. Rebuild and reinstall the app."
          : pickerError instanceof Error
            ? pickerError.message
            : "Unable to open image picker";
      showToast(message, "error");
      return;
    }

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      showToast(result.errorMessage, "error");
      return;
    }

    const asset = result.assets?.[0];

    if (!asset?.uri) {
      showToast("Unable to read selected image", "error");
      return;
    }

    await uploadAvatar(user.id, {
      uri: asset.uri,
      fileName: asset.fileName,
      type: asset.type,
      base64: asset.base64,
    });

    const currentError = useProfileStore.getState().error;
    if (currentError) {
      showToast(currentError, "error");
      return;
    }

    showToast("Avatar updated successfully", "success");
  };

  const onSubmit = async (data: ProfileFormData) => {
    if (!user?.id) return;
    if (__DEV__) console.log("[EditProfileScreen] submitting update:", data);
    await updateProfile(user.id, {
      full_name: data.full_name.trim(),
      phone: data.phone?.trim() || null,
    });
    const currentError = useProfileStore.getState().error;
    if (!currentError) {
      showToast("Profile updated successfully", "success");
      navigation.goBack();
    }
  };

  if (isLoading && !profile) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (error && !profile) {
    return (
      <ScreenWrapper>
        <ErrorState
          message={error}
          buttonTitle="Retry"
          onRetry={() => user?.id && fetchProfile(user.id)}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.xs }]}>Edit Profile</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.lg }]}>Update your personal information</Text>

        <Pressable
          onPress={handleAvatarUpload}
          disabled={isUploadingAvatar}
          style={[styles.avatarSection, { opacity: isUploadingAvatar ? 0.7 : 1 }]}
        >
          <View style={styles.avatarWrapper}>
            <ProfileAvatar uri={profile?.avatar_url} size={96} iconSize={48} />
            <View style={[styles.cameraIcon, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Camera size={scaleFont(14)} color="#FFF" />
            </View>
          </View>
          <Text style={[styles.changeAvatarText, { color: colors.primary, fontSize: typography.small, marginTop: spacing.sm }]}>
            {isUploadingAvatar ? "Uploading..." : "Change Avatar"}
          </Text>
        </Pressable>

        <Controller
          name="full_name"
          control={control}
          render={({ field: { onChange, value } }) => (
            <AppInput
              label="Full Name"
              placeholder="Enter your full name"
              value={value}
              onChangeText={onChange}
              error={errors.full_name?.message}
              autoCapitalize="words"
            />
          )}
        />

        <Controller
          name="phone"
          control={control}
          render={({ field: { onChange, value } }) => (
            <AppInput
              label="Phone"
              placeholder="Enter your phone number"
              value={value || ""}
              onChangeText={onChange}
              error={errors.phone?.message}
              keyboardType="phone-pad"
            />
          )}
        />

        <AppButton
          title="Save Changes"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting || isLoading}
          disabled={isSubmitting || isLoading || isUploadingAvatar}
          style={{ marginTop: spacing.md }}
        />

        {error && <Text style={[styles.errorMessage, { color: colors.error, marginTop: spacing.sm }]}>{error}</Text>}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  avatarSection: {
    alignItems: "center",
  },
  avatarWrapper: {
    width: wp(26),
    maxWidth: scaleFont(112),
    minWidth: scaleFont(88),
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: scaleFont(14),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  changeAvatarText: {
    fontWeight: "600",
  },
  errorMessage: {
    textAlign: "center",
    fontSize: scaleFont(14),
  },
});

export default EditProfileScreen;
