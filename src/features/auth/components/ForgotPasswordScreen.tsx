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
import { Mail, ArrowLeft } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppInput from "../../../components/ui/AppInput";
import AppButton from "../../../components/ui/AppButton";
import { authService } from "../api/authService";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import Floating3DLogo from "../../../components/ui/Floating3DLogo";
import { hp, scaleFont, wp } from "../../../utils/responsive";

type ForgotPasswordNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  "ForgotPassword"
>;

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ForgotPasswordScreen = () => {
    const { colors, spacing, radius, typography, isDarkMode } = useTheme();
    const navigation = useNavigation<ForgotPasswordNavigationProp>();
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

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
    }, []);

    const handleSendResetLink = async () => {
        if (isLoading) return;

        const normalizedEmail = email.trim().toLowerCase();
        setSuccessMessage("");
        setErrorMessage("");

        if (!normalizedEmail) {
            const message = "Email is required";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }

        if (!isValidEmail(normalizedEmail)) {
            const message = "Please enter a valid email address";
            setErrorMessage(message);
            toastService.error(message);
            return;
        }

        try {
            setIsLoading(true);
            const { error } = await authService.sendPasswordResetEmail(normalizedEmail);

            if (error) {
                throw error;
            }

            const message = "Password reset link sent. Check your email.";
            setSuccessMessage(message);
            toastService.success(message);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unable to send reset link";
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsLoading(false);
        }
    };

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
                        top: hp(25),
                        left: wp(-10),
                        backgroundColor: colors.primary + '15',
                        transform: [{ translateY: bgAnim1 }]
                    }
                ]} />
                <Animated.View style={[
                    styles.bgShape2,
                    {
                        top: hp(65),
                        right: wp(-15),
                        backgroundColor: colors.info + '15',
                        transform: [{ translateX: bgAnim2 }]
                    }
                ]} />

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
                        <Pressable 
                            style={[styles.backButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                            onPress={() => navigation.goBack()}
                        >
                            <ArrowLeft size={20} color="#FFFFFF" />
                        </Pressable>

                        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
                            <View style={styles.logoOutline}>
                                <Floating3DLogo size={scaleFont(32)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Text style={styles.appTitle}>QueueLess</Text>
                            <Text style={styles.appSubtitle}>Smart Healthcare Portal</Text>
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
                            {/* Spacing to align */}
                            <View style={{ height: hp(4) }} />

                            {/* Glassmorphic Form Card */}
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
                                }
                            ]}>
                                {/* Form Header */}
                                <Text style={[styles.formTitle, { color: colors.text, fontSize: scaleFont(18), fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center' }]}>
                                    Reset Password
                                </Text>

                                <Text style={[styles.formSubtitle, { color: colors.textSecondary, fontSize: scaleFont(12), marginBottom: spacing.md, textAlign: 'center', lineHeight: 18 }]}>
                                    Enter your email and we will send a secure reset link to recover your account.
                                </Text>

                                {/* Email input */}
                                <View style={{ marginTop: spacing.xs }}>
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
                                </View>

                                {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                                {successMessage ? <Text style={styles.successMessage}>{successMessage}</Text> : null}

                                {/* Reset Button */}
                                <AppButton
                                    title={isLoading ? "Sending..." : "Send Reset Link"}
                                    onPress={handleSendResetLink}
                                    loading={isLoading}
                                    containerStyle={styles.resetButton}
                                />
                            </View>
                        </View>

                        {/* Back to Login Footer */}
                        <Pressable
                            onPress={() => navigation.navigate("Login")}
                            style={({ pressed }) => [
                                styles.loginLinkContainer,
                                pressed && styles.pressedEffect
                            ]}
                        >
                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                Remembered your password? <Text style={{ color: colors.primary, fontWeight: '800' }}>Sign In</Text>
                            </Text>
                        </Pressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default ForgotPasswordScreen;

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
    formTitle: {
        fontSize: scaleFont(16),
        fontWeight: '800',
        textAlign: 'center',
    },
    formSubtitle: {
        fontSize: scaleFont(12),
        textAlign: 'center',
    },
    resetButton: {
        marginTop: hp(1.5),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginTop: hp(1),
        fontSize: scaleFont(12),
        fontWeight: '600',
    },
    successMessage: {
        color: '#22C55E',
        textAlign: 'center',
        marginTop: hp(1),
        fontSize: scaleFont(12),
        fontWeight: '600',
    },
    loginLinkContainer: {
        marginTop: hp(2),
        alignItems: 'center',
        paddingVertical: 8,
    },
    footerText: {
        fontSize: scaleFont(13),
    },
    pressedEffect: {
        opacity: 0.75,
    },
});
