import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AppButton from "../../../components/ui/AppButton";
import AppInput from "../../../components/ui/AppInput";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { authService } from "../api/authService";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import { colors, spacing, typography } from "../../../theme";

type ForgotPasswordNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  "ForgotPassword"
>;

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<ForgotPasswordNavigationProp>();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSendResetLink = async () => {
    if (isLoading) return;

    const normalizedEmail = email.trim().toLowerCase();
    setSuccessMessage("");

    if (!normalizedEmail) {
      const message = "Email is required";
      setErrorMessage(message);
      toastService.error(message);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      const message = "Please enter a valid email address";
      setErrorMessage(message);
      toastService.error(message);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage("");
      const { error } = await authService.sendPasswordResetEmail(normalizedEmail);

      if (error) {
        throw error;
      }

      const message = "Password reset link sent. Check your email.";
      setSuccessMessage(message);
      toastService.success(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send reset link";
      setErrorMessage(message);
      toastService.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenWrapper scrollable centered>
      <View style={styles.container}>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we will send a secure reset link.
        </Text>

        <AppInput
          placeholder="Email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          editable={!isLoading}
        />

        <AppButton
          title={isLoading ? "Sending..." : "Send Reset Link"}
          onPress={handleSendResetLink}
          loading={isLoading}
          disabled={isLoading}
        />

        {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
        {successMessage ? (
          <Text style={styles.successMessage}>{successMessage}</Text>
        ) : null}

        <Pressable disabled={isLoading} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.footerText}>Back to Login</Text>
        </Pressable>
      </View>
    </ScreenWrapper>
  );
};

export default ForgotPasswordScreen;

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
  footerText: {
    marginTop: spacing.lg,
    textAlign: "center",
    color: colors.primary,
    fontSize: typography.body,
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
