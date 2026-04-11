import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { colors, spacing, typography,} from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";

const SignupScreen = () => {
    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");

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
                    onPress={() => { }}
                />
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
    }
})