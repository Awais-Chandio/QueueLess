import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { colors, spacing, typography, } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";
import { useAuth } from "../../hooks/useAuth";

const SignupScreen = () => {
    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [errorMessage, setErrorMessage] = React.useState("");
    const { signup, isLoading } = useAuth();

    async function handleSignup() {
        if(name.trim() === "" || email.trim() === "" || password.trim() === "" || confirmPassword.trim() === "") {
            setErrorMessage("All fields are required");
            return;
        }
        if(password !== confirmPassword) {
            setErrorMessage("Passwords do not match");
            return;
        }
        try {
            setErrorMessage("");
            await signup({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                confirmPassword: ""
            });
        } catch (error: any) {
            setErrorMessage(error.message || "Signup failed");
        }}
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

                />
                <AppInput
                    placeholder="Password"
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                />

                <AppInput
                    placeholder="Confirm Password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={true}
                />
                <AppButton
                    title="Sign Up"
                    onPress={() => handleSignup()}
                    loading={isLoading}
                />
                    {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                <Pressable onPress={() => { }}
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
    }
})