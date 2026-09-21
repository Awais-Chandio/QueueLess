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
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import Floating3DLogo from "../../../components/ui/Floating3DLogo";
import DoctorSchedulingAnimation from "../../../components/animations/DoctorSchedulingAnimation";
import { hp, scaleFont, wp } from "../../../utils/responsive";

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const googleIconStyle = { marginRight: wp(2) };

const GoogleIcon = () => (
    <Svg width={18} height={18} viewBox="0 0 24 24" style={googleIconStyle}>
        <Path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <Path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <Path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <Path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
    </Svg>
);

const LoginScreen = () => {
    const { colors, spacing, radius, isDarkMode } = useTheme();
    const navigation = useNavigation<LoginScreenNavigationProp>();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const { login, loginWithGoogle, isLoading } = useAuth();

    // Mount animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const logoScale = useRef(new Animated.Value(0.8)).current;

    // Background shapes animations
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
    }, [bgAnim1, bgAnim2, fadeAnim, logoScale, slideAnim]);

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
            left: wp(-10),
            backgroundColor: colors.primary + '15',
            transform: [{ translateY: bgAnim1 }]
        }
    ];

    const dynamicBgShape2Style = [
        styles.bgShape2,
        {
            top: hp(65),
            right: wp(-15),
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
            backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.85)',
            borderRadius: radius.xl,
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.65)',
            shadowColor: isDarkMode ? '#000000' : colors.primary,
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
        marginRight: spacing.xs,
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
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
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
            backgroundColor: isDarkMode ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF'
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
            backgroundColor: isDarkMode ? 'rgba(0, 194, 168, 0.12)' : '#E6FDF9'
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
                                <Floating3DLogo size={scaleFont(32)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={titleContainerStyle}>
                            <Text style={styles.appTitle}>QueueLess</Text>
                            <Text style={styles.appSubtitle}>Smart Healthcare Portal</Text>
                        </Animated.View>
                    </LinearGradient>

                    {/* Lower Card Container */}
                    <Animated.View style={dynamicFormContainerStyle}>
                        <View style={styles.mainContent}>
                            {/* Premium Healthcare Welcome Illustration */}
                            <DoctorSchedulingAnimation />
                            <Text style={styles.illustrationText}>Smart Scheduling • Live Queue Tracking</Text>

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

                                {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

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
                                <Sparkles size={scaleFont(11)} color="#14B8A6" style={styles.badgeIcon} />
                                <Text style={[styles.badgeText, styles.tealBadgeText]}>Smart Queueing</Text>
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
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
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
        borderColor: 'rgba(255, 255, 255, 0.25)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    appTitle: {
        fontSize: scaleFont(22),
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: 0.8,
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
        color: '#EF4444',
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
    badgeIcon: {
        marginRight: 4,
    },
    tealBadgeText: {
        color: '#14B8A6',
    },
});
