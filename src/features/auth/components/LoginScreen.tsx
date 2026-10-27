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
    StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Mail, Lock, KeyRound, ShieldCheck, Sparkles } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import Floating3DLogo from "../../../components/ui/Floating3DLogo";
import Wordmark from "../../../components/ui/Wordmark";
import DoctorSchedulingAnimation from "../../../components/animations/DoctorSchedulingAnimation";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import { useAuthEntranceAnimation } from "../hooks/useAuthEntranceAnimation";
import { fixed } from '../../../theme/colors';
import GoogleIcon from '../../../components/ui/GoogleIcon';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LoginScreen = () => {
    const { colors, spacing, radius, isDarkMode } = useTheme();
    const navigation = useNavigation<LoginScreenNavigationProp>();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const { login, loginWithGoogle, isLoading } = useAuth();

    const { fadeAnim, slideAnim, logoScale } = useAuthEntranceAnimation();

    // Background shapes animations
    const bgAnim1 = useRef(new Animated.Value(0)).current;
    const bgAnim2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Background subtle animations
        Animated.loop(
            Animated.sequence([
                Animated.timing(bgAnim1, { toValue: 10, duration: 4000, useNativeDriver: true }),
                Animated.timing(bgAnim1, { toValue: 0, duration: 4000, useNativeDriver: true }),
            ])
        ).start();
        Animated.loop(
            Animated.sequence([
                Animated.timing(bgAnim2, { toValue: -15, duration: 5000, useNativeDriver: true }),
                Animated.timing(bgAnim2, { toValue: 0, duration: 5000, useNativeDriver: true }),
            ])
        ).start();
    }, [bgAnim1, bgAnim2]);

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

    async function handleGoogleLogin() {
        if (isLoading) return;
        try {
            setErrorMessage('');
            await loginWithGoogle();
            toastService.success('Logged in successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Google Sign-In failed';
            setErrorMessage(message);
            toastService.error(message);
        }
    }

    // Dynamic Styles to avoid inline styling warnings
    const dynamicBgShape1Style = [
        styles.bgShape,
        {
            top: hp(25),
            start: wp(-10),
            backgroundColor: colors.primary + '15',
            transform: [{ translateY: bgAnim1 }]
        }
    ];

    const dynamicBgShape2Style = [
        styles.bgShape2,
        {
            top: hp(65),
            end: wp(-15),
            backgroundColor: colors.info + '15',
            transform: [{ translateX: bgAnim2 }]
        }
    ];

    const dynamicLogoStyle = [
        styles.logoContainer,
        {
            opacity: fadeAnim,
            transform: [{ scale: logoScale }]
        }
    ];

    const titleContainerStyle = [
        styles.titleContainer,
        {
            opacity: fadeAnim
        }
    ];

    const dynamicFormContainerStyle = [
        styles.formContainer,
        {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
        }
    ];

    const dynamicFormCardStyle = [
        styles.formCard,
        {
            backgroundColor: colors.heroCard.bg,
            borderRadius: radius.xl,
            borderColor: colors.heroCard.border,
            shadowColor: isDarkMode ? colors.shadowColor : colors.primary,
            shadowOpacity: isDarkMode ? 0.4 : 0.08,
        }
    ];

    const dynamicFormTitleStyle = [
        styles.formTitle,
        {
            color: colors.text,
            marginBottom: spacing.md,
        }
    ];

    const inputContainerStyle = {
        marginTop: spacing.xs,
    };

    const keyRoundIconStyle = {
        marginEnd: spacing.xs,
    };

    const forgotPasswordTextStyle = [
        styles.forgotPasswordText,
        {
            color: colors.primary
        }
    ];

    const socialButtonStyle = [
        styles.socialButton,
        {
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
        }
    ];

    const socialButtonTextStyle = [
        styles.socialButtonText,
        {
            color: colors.text
        }
    ];

    const secureEncryptionBadgeStyle = [
        styles.badge,
        {
            backgroundColor: colors.tint.info
        }
    ];

    const secureEncryptionBadgeTextStyle = [
        styles.badgeText,
        {
            color: colors.primary
        }
    ];

    const smartQueueingBadgeStyle = [
        styles.badge,
        {
            backgroundColor: colors.tint.accent
        }
    ];

    const footerTextStyle = [
        styles.footerText,
        {
            color: colors.textSecondary
        }
    ];

    const signUpLinkStyle = {
        color: colors.primary,
        fontWeight: '800' as const,
    };

    const dividerLineStyle = {
        backgroundColor: colors.border,
    };

    const dividerTextStyle = [
        styles.dividerText,
        {
            color: colors.textSecondary
        }
    ];

    return (
        <ScreenWrapper scrollable={false} withPadding={false} edges={['left', 'right', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                {/* Floating soft background shapes */}
                <Animated.View style={dynamicBgShape1Style} />
                <Animated.View style={dynamicBgShape2Style} />

                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {/* Premium Header Gradient */}
                    <LinearGradient
                        colors={colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.headerGradient}
                    >
                        <Animated.View style={dynamicLogoStyle}>
                            <View style={styles.logoOutline}>
                                <Floating3DLogo size={scaleFont(32)} qColor={colors.onBrand} />
                            </View>
                        </Animated.View>

                        <Animated.View style={titleContainerStyle}>
                            <Wordmark size={22} tone="onColor" />
                            <Text style={styles.appSubtitle}>Smart Healthcare Portal</Text>
                        </Animated.View>
                    </LinearGradient>

                    {/* Lower Card Container */}
                    <Animated.View style={dynamicFormContainerStyle}>
                        <View style={styles.mainContent}>
                            {/* Premium Healthcare Welcome Illustration */}
                            <DoctorSchedulingAnimation />
                            <Text style={[styles.illustrationText, { color: colors.textTertiary }]}>Smart Scheduling • Live Queue Tracking</Text>

                            {/* Glassmorphic Form Card */}
                            <View style={dynamicFormCardStyle}>
                                {/* Form Header */}
                                <Text style={dynamicFormTitleStyle}>
                                    Sign In
                                </Text>

                                {/* Email inputs */}
                                <View style={inputContainerStyle}>
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
                                        leftIcon={Lock}
                                    />

                                    <View style={styles.forgotPasswordRow}>
                                        <Pressable
                                            disabled={isLoading}
                                            onPress={() => navigation.navigate("ForgotPassword")}
                                            style={({ pressed }) => [
                                                styles.forgotPasswordContainer,
                                                pressed && styles.pressedEffect
                                            ]}
                                        >
                                            <KeyRound size={scaleFont(13)} color={colors.primary} style={keyRoundIconStyle} />
                                            <Text style={forgotPasswordTextStyle}>Forgot Password?</Text>
                                        </Pressable>
                                    </View>
                                </View>

                                {errorMessage ? <Text style={[styles.errorMessage, { color: colors.error }]}>{errorMessage}</Text> : null}

                                {/* Gradient CTA Button */}
                                <AppButton
                                    title={isLoading ? "Please wait..." : "Login"}
                                    onPress={handleLogin}
                                    loading={isLoading}
                                    containerStyle={styles.loginButton}
                                />

                                {/* Divider */}
                                <View style={styles.dividerRow}>
                                    <View style={dividerLineStyle} />
                                    <Text style={dividerTextStyle}>or continue with</Text>
                                    <View style={dividerLineStyle} />
                                </View>

                                {/* Google Sign-in Button */}
                                <Pressable
                                    style={({ pressed }) => [
                                        socialButtonStyle,
                                        pressed && styles.pressedEffect
                                    ]}
                                    onPress={handleGoogleLogin}
                                    disabled={isLoading}
                                >
                                    <GoogleIcon />
                                    <Text style={socialButtonTextStyle}>Sign in with Google</Text>
                                </Pressable>
                            </View>
                        </View>

                        {/* Security & Support Badges to fill space */}
                        <View style={styles.badgeRow}>
                            <View style={secureEncryptionBadgeStyle}>
                                <ShieldCheck size={scaleFont(11)} color={colors.primary} style={styles.badgeIcon} />
                                <Text style={secureEncryptionBadgeTextStyle}>Secure Encryption</Text>
                            </View>
                            <View style={smartQueueingBadgeStyle}>
                                <Sparkles size={scaleFont(11)} color={colors.accent} style={styles.badgeIcon} />
                                <Text style={[styles.badgeText, { color: colors.accent }]}>Smart Queueing</Text>
                            </View>
                        </View>

                        {/* Sign Up Footer */}
                        <Pressable
                            onPress={() => navigation.navigate("Signup")}
                            style={({ pressed }) => [
                                styles.signupLinkContainer,
                                pressed && styles.pressedEffect
                            ]}
                        >
                            <Text style={footerTextStyle}>
                                Don't have an account? <Text style={signUpLinkStyle}>Sign Up</Text>
                            </Text>
                        </Pressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default LoginScreen;

const styles = StyleSheet.create({
    keyboardContainer: {
        flex: 1,
    },
    bgShape: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        opacity: 0.5,
    },
    bgShape2: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        opacity: 0.5,
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(1.5),
        borderBottomStartRadius: 25,
        borderBottomEndRadius: 25,
    },
    titleContainer: {
        alignItems: 'center',
    },
    logoContainer: {
        marginBottom: hp(0.3),
    },
    logoOutline: {
        padding: 5,
        borderWidth: 1,
        borderRadius: 18,
        borderColor: fixed.brandGlassBorder,
        backgroundColor: fixed.brandGlassBg,
    },
    appSubtitle: {
        fontSize: scaleFont(11),
        color: fixed.onBrandMuted,
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
        borderWidth: 1,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 24,
        elevation: 8,
    },
    formTitle: {
        fontSize: scaleFont(18),
        fontWeight: '800',
        textAlign: 'center',
    },
    forgotPasswordRow: {
        alignItems: 'flex-end',
        marginBottom: hp(0.5),
        marginTop: hp(0.5),
    },
    forgotPasswordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
    },
    forgotPasswordText: {
        fontSize: scaleFont(11),
        fontWeight: '600',
    },
    loginButton: {
        marginTop: hp(1),
    },
    errorMessage: {
        textAlign: 'center',
        marginTop: hp(0.8),
        fontSize: scaleFont(12),
        fontWeight: '600',
    },
    signupLinkContainer: {
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
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: hp(1.2),
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        marginHorizontal: wp(3),
        fontSize: scaleFont(11),
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: hp(1.4),
        borderWidth: 1.2,
        width: '100%',
    },
    socialButtonText: {
        fontSize: scaleFont(14),
        fontWeight: '700',
    },
    illustrationText: {
        fontSize: scaleFont(12),
        fontWeight: '600',
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
    badgeIcon: {
        marginEnd: 4,
    },
});
