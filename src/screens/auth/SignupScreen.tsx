import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";
import { useAuth } from "../../hooks/useAuth";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";

type SignupScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Signup">;

const SignupScreen = () => {
    const navigation = useNavigation<SignupScreenNavigationProp>();
    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [errorMessage, setErrorMessage] = React.useState("");
    const [successMessage, setSuccessMessage] = React.useState("");
    const { signup, isLoading } = useAuth();

    async function handleSignup() {
        if (isLoading) return;

        setSuccessMessage("");

        if (name.trim() === "" || email.trim() === "" || password.trim() === "" || confirmPassword.trim() === "") {
            setErrorMessage("All fields are required");
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match");
            return;
        }
        try {
            setErrorMessage("");
            await signup({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                confirmPassword
            });
            setPassword("");
            setConfirmPassword("");
            setSuccessMessage("Account created. Please check your email, then login.");
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Signup failed");
        }
    }
    return (



        <ScreenWrapper>
            <View style={styles.container}>
                <Text

                    style={styles.title}>
                    Create Account
                </Text>
                <Text style={styles.subtitle}>
                    Create an account to get started.
                </Text>

                <AppInput
                    placeholder="Name"
                    label="Name"
                    value={name}
                    onChangeText={setName}
                />

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
                    textContentType="newPassword"
                    autoComplete="new-password"
                />

                <AppInput
                    placeholder="Confirm Password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    autoComplete="new-password"
                />
                <AppButton
                    title="Sign Up"
                    onPress={() => handleSignup()}
                    loading={isLoading}
                />
                {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                {successMessage ? <Text style={styles.successMessage}>{successMessage}</Text> : null}
                <Pressable onPress={() => navigation.navigate("Login")}
                >
                    <Text style={styles.footerText}>Already have an account? Login</Text>
                </Pressable>


            </View>


        </ScreenWrapper>
    )
}

export default SignupScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: typography.h1,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.body,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
        textAlign: 'center',
    },
    footerText: {
        color: colors.primary,
        marginTop: spacing.md,
        textAlign: 'center',
    },
    errorMessage: {
        color: colors.error,
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    successMessage: {
        color: colors.success,
        textAlign: 'center',
        marginTop: spacing.sm,
    }
})
