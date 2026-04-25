import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";
import { useAuth } from "../../hooks/useAuth";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">;

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const { login,isLoading } = useAuth();
      async function handleLogin() {
  if (isLoading) return;

  if (!email.trim() || !password.trim()) {
    setErrorMessage('Email and password are required');
    return;
  }

  try {
    setErrorMessage('');

    await login({
      email: email.trim().toLowerCase(),
      password,
    });
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : 'Login failed');
  }
}
    return (
        <ScreenWrapper>
            <View style={styles.container}>
                <Text style={styles.title}>
                    Login
                </Text>
                <Text style={styles.subtitle}>
                    Welcome back, sign in to continue.
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
                />
                <AppInput
                    placeholder="Password"
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    autoComplete="password"
                />

                <AppButton
                    title="Login"
                    onPress={handleLogin}
                    loading={isLoading}
                />
                    {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

                <Pressable onPress={() => navigation.navigate("Signup")}>
                    <Text style={styles.footerText}>Don't have an account? Sign Up</Text>
                </Pressable>




            </View>
        </ScreenWrapper>
    );
};

export default LoginScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: typography.h1,
        color: colors.text,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: typography.body,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.md,
        marginBottom: spacing.xl,

    },
    footerText: {
        marginTop: spacing.lg,
        textAlign: 'center',
        color: colors.primary
    },
    errorMessage: {
        color: colors.error,
        textAlign: 'center',
        marginTop: spacing.sm,
    }
});
