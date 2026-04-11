import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";


const LoginScreen = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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
                />
                <AppInput
                    placeholder="Password"
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                />

                <AppButton
                    title="Login"
                    onPress={() => { }}
                />

                <Pressable onPress={() => { }}>
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
    }
});
