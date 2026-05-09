import React, { useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigation } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";
import Loader from "../../components/common/Loader";
import ErrorState from "../../components/common/ErrorState";
import { useAuth } from "../../hooks/useAuth";
import { useProfileStore } from "../../store/profileStore";
import { useToastStore } from "../../store/toastStore";
import { profileSchema, type ProfileFormData } from "../../validations/profileSchema";
import { colors, spacing, typography } from "../../theme";

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { profile, isLoading, error, fetchProfile, updateProfile } = useProfileStore();
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

  // Prefill form when profile data is available
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

  const onSubmit = async (data: ProfileFormData) => {
    if (!user?.id) return;
    if (__DEV__) console.log('[EditProfileScreen] submitting update:', data);
    await updateProfile(user.id, {
      full_name: data.full_name,
      phone: data.phone || undefined,
    });
    // Only navigate back if there is no error after update
    const currentError = useProfileStore.getState().error;
    if (!currentError) {
      showToast('Profile updated successfully', 'success');
      navigation.goBack();
    }
  };

  // Show loader only on initial profile fetch, not during form submission
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
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Update your personal information</Text>

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
          disabled={isSubmitting || isLoading}
        />

        {error && (
          <Text style={styles.errorMessage}>{error}</Text>
        )}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  errorMessage: {
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});

export default EditProfileScreen;
