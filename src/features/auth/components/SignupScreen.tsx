import React, { useState, useEffect, useRef } from "react";
import {
    View,
    StyleSheet,
    Text,
    Pressable,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image,
    StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Mail, Lock, User, ArrowLeft, ArrowRight, CheckCircle2, Activity } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import Floating3DLogo from "../../../components/ui/Floating3DLogo";
import DoctorConsultationAnimation from "../../../components/animations/DoctorConsultationAnimation";
import { hp, scaleFont, wp } from "../../../utils/responsive";

type SignupScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Signup">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SignupScreen = () => {
    const { colors, spacing, radius, typography, isDarkMode } = useTheme();
    const navigation = useNavigation<SignupScreenNavigationProp>();

    // Step state: 1 = Name/Email, 2 = Password/Confirm
    const [step, setStep] = useState<1 | 2>(1);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const { signup, isLoading } = useAuth();

    // Field validation live status animations
    const nameValid = name.trim().length > 1;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const passValid = password.length >= 6;
    const confirmValid = password === confirmPassword && confirmPassword.length > 0;

    // Mount animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const logoScale = useRef(new Animated.Value(0.8)).current;

    // Wizard slider animation
    const stepAnim = useRef(new Animated.Value(0)).current; // 0 for Step 1, 1 for Step 2

    // Background floating animation
    const bgAnim1 = useRef(new Animated.Value(0)).current;
    const bgAnim2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
                toValue: 1,
                friction: 5,
                tension: 30,
                useNativeDriver: true,
            })
        ]).start();

        // Start floating background shapes
        Animated.loop(
            Animated.sequence([
                Animated.timing(bgAnim1, { toValue: -12, duration: 4500, useNativeDriver: true }),
                Animated.timing(bgAnim1, { toValue: 0, duration: 4500, useNativeDriver: true }),
            ])
        ).start();
        Animated.loop(
            Animated.sequence([
                Animated.timing(bgAnim2, { toValue: 15, duration: 5500, useNativeDriver: true }),
                Animated.timing(bgAnim2, { toValue: 0, duration: 5500, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const goToStep2 = () => {
        if (!name.trim()) {
            const message = "Please enter your full name";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        if (!email.trim() || !emailValid) {
            const message = "Please enter a valid email address";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        setErrorMessage("");
        setStep(2);
        Animated.timing(stepAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    const goToStep1 = () => {
        setErrorMessage("");
        setStep(1);
        Animated.timing(stepAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    async function handleSignup() {
        if (isLoading) return;

        setSuccessMessage("");
        setErrorMessage("");

        if (!passValid) {
            const message = "Password must be at least 6 characters";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }
        if (!confirmValid) {
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

    // Step Slider Interpolations
    const step1TranslateX = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -wp(100)],
    });
    const step1Opacity = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
    });

    const step2TranslateX = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [wp(100), 0],
    });
    const step2Opacity = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    return (
        <ScreenWrapper scrollable={false} withPadding={false} edges={['left', 'right', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                {/* Floating soft background shapes */}
                <Animated.View style={[
                    styles.bgShape, 
                    { 
                        top: hp(30), 
                        right: wp(-10), 
                        backgroundColor: colors.primary + '15',
                        transform: [{ translateY: bgAnim1 }]
                    }
                ]} />
                <Animated.View style={[
                    styles.bgShape2, 
                    { 
                        bottom: hp(10), 
                        left: wp(-15), 
                        backgroundColor: colors.info + '15',
                        transform: [{ translateX: bgAnim2 }]
                    }
                ]} />

                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {/* Soft gradient header */}
                    <LinearGradient
                        colors={colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.headerGradient}
                    >
                        <Pressable 
                            style={[styles.backButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                            onPress={() => step === 2 ? goToStep1() : navigation.goBack()}
                        >
                            <ArrowLeft size={20} color="#FFFFFF" />
                        </Pressable>

                        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
                            <View style={styles.logoOutline}>
                                <Floating3DLogo size={scaleFont(32)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Text style={styles.appTitle}>Create Account</Text>
                            <Text style={styles.appSubtitle}>Step {step} of 2</Text>
                        </Animated.View>
                    </LinearGradient>

                    {/* Lower Card Container */}
                    <Animated.View
                        style={[
                            styles.formContainer,
                            {
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }]
                            }
                        ]}
                    >
                        <View style={styles.mainContent}>
                            {/* Premium Healthcare Welcome Illustration */}
                            <DoctorConsultationAnimation />
                            <Text style={styles.illustrationText}>Join QueueLess to Skip Waiting Lines</Text>

                            {/* Glassmorphic Wizard Card */}
                            <View style={[
                                styles.formCard, 
                                { 
                                    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.85)',
                                    borderRadius: radius.xl,
                                    borderWidth: 1,
                                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.65)',
                                    shadowColor: isDarkMode ? '#000000' : colors.primary,
                                    shadowOffset: { width: 0, height: 12 },
                                    shadowOpacity: isDarkMode ? 0.4 : 0.08,
                                    shadowRadius: 24,
                                    elevation: 8,
                                    overflow: 'hidden',
                                }
                            ]}>
                                {/* Wizard Progress Line */}
                                <View style={styles.progressContainer}>
                                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                                        <View style={[
                                            styles.progressFill, 
                                            { 
                                                backgroundColor: colors.primary, 
                                                width: step === 1 ? '50%' : '100%' 
                                            }
                                        ]} />
                                    </View>
                                </View>

                                {/* Dynamic Wizard Slider Sheets */}
                                <View style={styles.sliderContainer}>
                                    {/* STEP 1 */}
                                    <Animated.View style={[
                                        styles.stepSheet, 
                                        { 
                                            transform: [{ translateX: step1TranslateX }], 
                                            opacity: step1Opacity,
                                            position: step === 1 ? 'relative' : 'absolute' 
                                        }
                                    ]}>
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
                                        {nameValid && (
                                            <View style={styles.validationRow}>
                                                <CheckCircle2 size={12} color={colors.success} style={{ marginRight: 4 }} />
                                                <Text style={[styles.validationText, { color: colors.success }]}>Valid Name</Text>
                                            </View>
                                        )}

                                        <AppInput
                                            placeholder="Email Address"
                                            label="Email"
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
                                        {emailValid && (
                                            <View style={styles.validationRow}>
                                                <CheckCircle2 size={12} color={colors.success} style={{ marginRight: 4 }} />
                                                <Text style={[styles.validationText, { color: colors.success }]}>Valid Email Format</Text>
                                            </View>
                                        )}

                                        <AppButton
                                            title="Continue"
                                            onPress={goToStep2}
                                            containerStyle={{ marginTop: spacing.md }}
                                        />
                                    </Animated.View>

                                    {/* STEP 2 */}
                                    <Animated.View style={[
                                        styles.stepSheet, 
                                        { 
                                            transform: [{ translateX: step2TranslateX }], 
                                            opacity: step2Opacity,
                                            position: step === 2 ? 'relative' : 'absolute' 
                                        }
                                    ]}>
                                        <AppInput
                                            placeholder="Password"
                                            label="Password"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={true}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            textContentType="newPassword"
                                            editable={!isLoading}
                                            leftIcon={Lock}
                                        />
                                        {passValid && (
                                            <View style={styles.validationRow}>
                                                <CheckCircle2 size={12} color={colors.success} style={{ marginRight: 4 }} />
                                                <Text style={[styles.validationText, { color: colors.success }]}>Password strength valid</Text>
                                            </View>
                                        )}

                                        <AppInput
                                            placeholder="Confirm Password"
                                            label="Confirm Password"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={true}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            textContentType="newPassword"
                                            editable={!isLoading}
                                            leftIcon={Lock}
                                        />
                                        {confirmValid && (
                                            <View style={styles.validationRow}>
                                                <CheckCircle2 size={12} color={colors.success} style={{ marginRight: 4 }} />
                                                <Text style={[styles.validationText, { color: colors.success }]}>Passwords match</Text>
                                            </View>
                                        )}

                                        <View style={styles.buttonsRow}>
                                            <Pressable 
                                                style={[styles.btnOutline, { borderColor: colors.border }]} 
                                                onPress={goToStep1}
                                                disabled={isLoading}
                                            >
                                                <Text style={[styles.btnOutlineText, { color: colors.textSecondary }]}>Back</Text>
                                            </Pressable>
                                            <View style={{ flex: 1, marginLeft: spacing.sm }}>
                                                <AppButton
                                                    title={isLoading ? "Signing up..." : "Sign Up"}
                                                    onPress={handleSignup}
                                                    loading={isLoading}
                                                />
                                            </View>
                                        </View>
                                    </Animated.View>
                                </View>
                            </View>

                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                            {successMessage ? <Text style={styles.successMessage}>{successMessage}</Text> : null}
                        </View>

                        {/* Security & Support Badges to fill space */}
                        <View style={styles.badgeRow}>
                            <View style={[styles.badge, { backgroundColor: isDarkMode ? 'rgba(0, 194, 168, 0.12)' : '#E6FDF9' }]}>
                                <CheckCircle2 size={scaleFont(11)} color="#14B8A6" style={{ marginRight: 4 }} />
                                <Text style={[styles.badgeText, { color: '#14B8A6' }]}>Zero Wait Time</Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7' }]}>
                                <Activity size={scaleFont(11)} color="#D97706" style={{ marginRight: 4 }} />
                                <Text style={[styles.badgeText, { color: '#D97706' }]}>Live Tracking</Text>
                            </View>
                        </View>

                        {/* Sign In Link */}
                        <Pressable
                            onPress={() => navigation.navigate("Login")}
                            style={({ pressed }) => [
                                styles.loginLinkContainer,
                                pressed && styles.pressedEffect
                            ]}
                        >
                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                Already have an account? <Text style={{ color: colors.primary, fontWeight: '800' }}>Sign In</Text>
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
    bgShape: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        opacity: 0.5,
    },
    bgShape2: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        opacity: 0.5,
    },
    illustration: {
        width: '100%',
        height: hp(15),
        alignSelf: 'center',
        marginBottom: hp(2),
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(2),
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
    },
    backButton: {
        position: 'absolute',
        top: hp(3.5),
        left: wp(5),
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    logoContainer: {
        marginBottom: hp(0.3),
    },
    logoOutline: {
        padding: 5,
        borderWidth: 1,
        borderRadius: 18,
        borderColor: 'rgba(255, 255, 255, 0.25)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    appTitle: {
        fontSize: scaleFont(22),
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    appSubtitle: {
        fontSize: scaleFont(11),
        color: 'rgba(255, 255, 255, 0.85)',
        textAlign: 'center',
        marginTop: 2,
        fontWeight: '600',
    },
    formContainer: {
        flex: 1,
        marginTop: -20,
        paddingHorizontal: wp(5),
        paddingBottom: hp(2),
        justifyContent: 'space-between',
    },
    mainContent: {
        flex: 1,
        justifyContent: 'center',
    },
    formCard: {
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
    },
    progressContainer: {
        marginBottom: hp(1.5),
    },
    progressBar: {
        height: 4,
        width: '100%',
        borderRadius: 2,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    sliderContainer: {
        width: '100%',
        minHeight: hp(24),
    },
    stepSheet: {
        width: '100%',
    },
    validationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -4,
        marginBottom: 8,
        paddingLeft: 4,
    },
    validationText: {
        fontSize: scaleFont(11),
        fontWeight: '600',
    },
    buttonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: hp(2),
    },
    btnOutline: {
        borderWidth: 1.2,
        height: hp(6.2),
        paddingHorizontal: wp(6),
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    btnOutlineText: {
        fontWeight: '700',
        fontSize: scaleFont(14),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
        fontWeight: '600',
        paddingHorizontal: wp(4),
    },
    successMessage: {
        color: '#22C55E',
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
        fontWeight: '600',
        paddingHorizontal: wp(4),
    },
    loginLinkContainer: {
        marginTop: hp(1),
        alignItems: 'center',
        paddingVertical: 6,
    },
    footerText: {
        fontSize: scaleFont(13),
    },
    pressedEffect: {
        opacity: 0.75,
    },
    illustrationText: {
        fontSize: scaleFont(12),
        fontWeight: '600',
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: hp(0.5),
        marginBottom: hp(1),
        letterSpacing: 0.5,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: hp(2),
        marginBottom: hp(0.5),
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(3),
        paddingVertical: 5,
        borderRadius: 20,
        marginHorizontal: wp(1.5),
    },
    badgeText: {
        fontSize: scaleFont(10.5),
        fontWeight: '700',
    },
});
