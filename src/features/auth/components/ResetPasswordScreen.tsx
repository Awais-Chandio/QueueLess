import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../../../components/ui/AppButton";
import AppInput from "../../../components/ui/AppInput";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import Card from "../../../components/ui/Card";
import { authService } from "../api/authService";
import { useAuthStore } from "../../../store/authStore";
import { toastService } from "../../../services/toastService";
import { useTheme } from "../../../hooks/useTheme";
import { Lock } from "lucide-react-native";
import { hp, scaleFont, wp } from "../../../utils/responsive";

const MIN_PASSWORD_LENGTH = 6;

const ResetPasswordScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
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
      <View style={[styles.container, { paddingHorizontal: wp(5) }]}>
        <Card variant="elevated" style={styles.formCard}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.h1 }]}>Reset Password</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.sm, marginBottom: spacing.lg }]}>
            Create a secure new password for your account.
          </Text>

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
            leftIcon={Lock}
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
            leftIcon={Lock}
          />

          <AppButton
            title={isLoading ? "Updating..." : "Update Password"}
            onPress={handleUpdatePassword}
            loading={isLoading}
            containerStyle={{ marginTop: spacing.md }}
          />

          {errorMessage ? <Text style={[styles.errorMessage, { color: colors.error, fontSize: typography.small, marginTop: spacing.md }]}>{errorMessage}</Text> : null}
          {successMessage ? (
            <Text style={[styles.successMessage, { color: colors.success, fontSize: typography.small, marginTop: spacing.md }]}>{successMessage}</Text>
          ) : null}
        </Card>
      </View>
    </ScreenWrapper>
  );
};

export default ResetPasswordScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  formCard: {
    padding: wp(6),
  },
  title: {
    textAlign: "center",
    fontWeight: "800",
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  errorMessage: {
    textAlign: "center",
    fontWeight: "600",
  },
  successMessage: {
    textAlign: "center",
    fontWeight: "600",
  },
});
