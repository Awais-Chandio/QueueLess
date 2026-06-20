import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../../../components/ui/AppButton";
import AppInput from "../../../components/ui/AppInput";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { authService } from "../api/authService";
import { useAuthStore } from "../../../store/authStore";
import { toastService } from "../../../services/toastService";
import { colors, spacing, typography } from "../../../theme";

const MIN_PASSWORD_LENGTH = 6;

const ResetPasswordScreen = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const clearAuth = useAuthStore(state => state.clearAuth);
  const setPasswordRecovery = useAuthStore(state => state.setPasswordRecovery);

  const validate = () => {
    if (!password.trim() || !confirmPassword.trim()) {
      return "New password and confirmation are required";
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (password !== confirmPassword) {
      return "Passwords do not match";
    }

    return "";
  };

  const handleUpdatePassword = async () => {
    if (isLoading) return;

    setSuccessMessage("");
    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      toastService.error(validationError);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage("");
      const { error } = await authService.updatePassword(password);

      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmPassword("");
      setPasswordRecovery(false);
      await authService.signOut();
      clearAuth();

      const message = "Password updated. Please log in with your new password.";
      setSuccessMessage(message);
      toastService.success(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update password";
      setErrorMessage(message);
      toastService.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenWrapper scrollable centered>
      <View style={styles.container}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Create a new password for your account.</Text>

        <AppInput
          placeholder="New Password"
          label="New Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          editable={!isLoading}
        />

        <AppInput
          placeholder="Confirm Password"
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          editable={!isLoading}
        />

        <AppButton
          title={isLoading ? "Updating..." : "Update Password"}
          onPress={handleUpdatePassword}
          loading={isLoading}
          disabled={isLoading}
        />

        {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
        {successMessage ? (
          <Text style={styles.successMessage}>{successMessage}</Text>
        ) : null}
      </View>
    </ScreenWrapper>
  );
};

export default ResetPasswordScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: typography.h1,
    color: colors.text,
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  errorMessage: {
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.sm,
    fontSize: typography.small,
  },
  successMessage: {
    color: colors.success,
    textAlign: "center",
    marginTop: spacing.sm,
    fontSize: typography.small,
  },
});
