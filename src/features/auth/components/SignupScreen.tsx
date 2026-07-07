import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Text, Pressable, Animated, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Mail, Lock, User } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import MedicalLogo from "../../../components/ui/MedicalLogo";
import { hp, scaleFont, wp } from "../../../utils/responsive";

type SignupScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Signup">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SignupScreen = () => {
    const { colors, spacing, typography, radius } = useTheme();
    const navigation = useNavigation<SignupScreenNavigationProp>();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const { signup, loginWithGoogle, isLoading } = useAuth();

    // Mount animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const logoScale = useRef(new Animated.Value(0.85)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
                toValue: 1,
                friction: 6,
                tension: 40,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

    async function handleSignup() {
        if (isLoading) return;

        setSuccessMessage("");
        setErrorMessage("");

        if (name.trim() === "" || email.trim() === "" || password.trim() === "" || confirmPassword.trim() === "") {
            const message = "All fields are required";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            const message = "Please enter a valid email address";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        if (password.length < 6) {
            const message = "Password must be at least 6 characters";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        if (password !== confirmPassword) {
            const message = "Passwords do not match";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        try {
            await signup({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                confirmPassword
            });
            setPassword("");
            setConfirmPassword("");
            const message = "Account created successfully. Check your email if confirmation is required.";
            setSuccessMessage(message);
            toastService.success(message);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Signup failed";
            setErrorMessage(message);
            toastService.error(message);
        }
    }

    async function handleGoogleLogin() {
        if (isLoading) return;
        try {
            setErrorMessage('');
            setSuccessMessage('');
            await loginWithGoogle();
            toastService.success('Logged in successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Google Sign-In failed';
            setErrorMessage(message);
            toastService.error(message);
        }
    }

    return (
        <ScreenWrapper scrollable={false} withPadding={false}>
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Upper Gradient Header */}
                    <LinearGradient
                        colors={[colors.primary, '#14B8A6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.headerGradient}
                    >
                        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
                            <View style={styles.logoOutline}>
                                <MedicalLogo size={scaleFont(48)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Text style={styles.appTitle}>Create Account</Text>
                            <Text style={styles.appSubtitle}>Smart Healthcare Queue Management</Text>
                            <Text style={styles.tagline}>Skip the waiting room.</Text>
                        </Animated.View>
                    </LinearGradient>

                    {/* Lower Input Container */}
                    <Animated.View
                        style={[
                            styles.formContainer,
                            {
                                backgroundColor: colors.background,
                                borderTopLeftRadius: radius.xl,
                                borderTopRightRadius: radius.xl,
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }]
                            }
                        ]}
                    >
                        <View style={[styles.formCard, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
                            <AppInput
                                placeholder="Full Name"
                                label="Full Name"
                                value={name}
                                onChangeText={setName}
                                autoCapitalize="words"
                                autoCorrect={false}
                                editable={!isLoading}
                                leftIcon={User}
                            />

                            <AppInput
                                placeholder="Email Address"
                                label="Email Address"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="emailAddress"
                                autoComplete="email"
                                editable={!isLoading}
                                leftIcon={Mail}
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
                                editable={!isLoading}
                                leftIcon={Lock}
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
                                editable={!isLoading}
                                leftIcon={Lock}
                            />

                            <AppButton
                                title={isLoading ? "Creating account..." : "Sign Up"}
                                onPress={handleSignup}
                                loading={isLoading}
                                style={styles.signupButton}
                            />

                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                            {successMessage ? <Text style={styles.successMessage}>{successMessage}</Text> : null}

                            <View style={styles.dividerRow}>
                                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
                                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                            </View>

                            <Pressable
                                disabled={isLoading}
                                onPress={handleGoogleLogin}
                                style={({ pressed }) => [
                                    styles.googleButton,
                                    {
                                        borderColor: colors.border,
                                        borderRadius: radius.xl,
                                        backgroundColor: colors.surface,
                                    },
                                    pressed && styles.pressedEffect
                                ]}
                            >
                                <Image
                                    source={{ uri: 'https://img.icons8.com/color/48/000000/google-logo.png' }}
                                    style={styles.googleIcon}
                                />
                                <Text style={[styles.googleButtonText, { color: colors.text }]}>
                                    Continue with Google
                                </Text>
                            </Pressable>
                        </View>

                        <Pressable
                            onPress={() => navigation.navigate("Login")}
                            style={({ pressed }) => [
                                styles.loginLinkContainer,
                                pressed && styles.pressedEffect
                            ]}
                        >
                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                Already have an account? <Text style={{ color: colors.primary, fontWeight: '700' }}>Login</Text>
                            </Text>
                        </Pressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default SignupScreen;

const styles = StyleSheet.create({
    keyboardContainer: {
        flex: 1,
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.23,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(1),
    },
    logoContainer: {
        marginBottom: hp(0.5),
    },
    logoOutline: {
        padding: 6,
        borderWidth: 1,
        borderRadius: 24,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    appTitle: {
        fontSize: scaleFont(26),
        fontWeight: 'bold',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    appSubtitle: {
        fontSize: scaleFont(13),
        color: 'rgba(255, 255, 255, 0.9)',
        textAlign: 'center',
        marginTop: 4,
        fontWeight: '600',
    },
    tagline: {
        fontSize: scaleFont(11),
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginTop: 6,
        fontStyle: 'italic',
    },
    formContainer: {
        flex: 1,
        marginTop: -20,
        paddingHorizontal: wp(5),
        paddingTop: hp(1.5),
        paddingBottom: hp(6),
    },
    formCard: {
        padding: wp(4.5),
        elevation: 4,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        borderWidth: Platform.OS === 'ios' ? 0 : 1,
        borderColor: '#E2E8F0',
    },
    signupButton: {
        marginTop: hp(1.5),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
    },
    successMessage: {
        color: '#10B981',
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
    },
    loginLinkContainer: {
        marginTop: hp(2.5),
        alignItems: 'center',
        paddingVertical: 8,
    },
    footerText: {
        fontSize: scaleFont(14),
    },
    pressedEffect: {
        opacity: 0.75,
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: hp(1.5),
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        marginHorizontal: wp(3),
        fontSize: scaleFont(12),
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: hp(1.4),
        borderWidth: 1.5,
        marginTop: hp(1),
    },
    googleIcon: {
        width: scaleFont(18),
        height: scaleFont(18),
        marginRight: wp(2.5),
    },
    googleButtonText: {
        fontSize: scaleFont(14),
        fontWeight: '700',
    },
});
