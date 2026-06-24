import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../../theme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">;

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const { login, isLoading } = useAuth();
    async function handleLogin() {
        if (isLoading) return;

        if (!email.trim() || !password.trim()) {
            const message = 'Email and password are required';
            setErrorMessage(message);
            toastService.error(message);
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            const message = 'Please enter a valid email address';
            setErrorMessage(message);
            toastService.error(message);
            return;
        }

        try {
            setErrorMessage('');

            await login({
                email: email.trim().toLowerCase(),
                password,
            });
            toastService.success('Logged in successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            setErrorMessage(message);
            toastService.error(message);
        }
    }
    return (
        <ScreenWrapper scrollable centered>
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
                    editable={!isLoading}
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
                    editable={!isLoading}
                />

                <Pressable
                    disabled={isLoading}
                    onPress={() => navigation.navigate("ForgotPassword")}
                >
                    <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </Pressable>

                <AppButton
                    title={isLoading ? "Logging in..." : "Login"}
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
        color: colors.primary,
        fontSize: typography.body,
    },
    forgotPasswordText: {
        marginBottom: spacing.md,
        textAlign: 'right',
        color: colors.primary,
        fontSize: typography.small,
        fontWeight: '600',
    },
    errorMessage: {
        color: colors.error,
        textAlign: 'center',
        marginTop: spacing.sm,
        fontSize: typography.small,
    }
});
