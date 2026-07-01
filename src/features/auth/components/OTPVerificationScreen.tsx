import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Text, Pressable, Animated, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { Lock, ArrowLeft, RefreshCw } from "lucide-react-native";
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

type OTPVerificationRouteProp = RouteProp<AuthStackParamList, "OTPVerification">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const RESEND_COOLDOWN = 60; // 60 seconds cooldown for resending

const OTPVerificationScreen = () => {
    const { colors, spacing, typography, radius } = useTheme();
    const navigation = useNavigation();
    const route = useRoute<OTPVerificationRouteProp>();
    const { verifyPhoneOtp, sendPhoneOtp } = useAuth();

    const { phone } = route.params;

    const [otpCode, setOtpCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
    const [errorMessage, setErrorMessage] = useState('');

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

    // Cooldown timer logic
    useEffect(() => {
        if (cooldown === 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const handleVerifyOTP = async () => {
        if (isVerifying) return;

        const cleanOtp = otpCode.trim();
        if (!cleanOtp) {
            const msg = "Verification code is required";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
            const msg = "Please enter a valid 6-digit numeric OTP";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        try {
            setErrorMessage('');
            setIsVerifying(true);
            await verifyPhoneOtp(phone, cleanOtp);
            toastService.success('Logged in successfully');
            // RootNavigator will handle redirection automatically upon session and role changes.
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid verification code';
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResendOTP = async () => {
        if (cooldown > 0 || isResending) return;

        try {
            setErrorMessage('');
            setIsResending(true);
            await sendPhoneOtp(phone);
            setCooldown(RESEND_COOLDOWN);
            toastService.success('OTP code re-sent successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to resend OTP';
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsResending(false);
        }
    };

    return (
        <ScreenWrapper scrollable={false}>
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
                        <Pressable 
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                        >
                            <ArrowLeft size={scaleFont(24)} color="#FFFFFF" />
                        </Pressable>

                        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
                            <View style={styles.logoOutline}>
                                <MedicalLogo size={scaleFont(48)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Text style={styles.appTitle}>QueueLess</Text>
                            <Text style={styles.appSubtitle}>Smart Healthcare Queue Management</Text>
                            <Text style={styles.tagline}>Verification Code</Text>
                        </Animated.View>
                    </LinearGradient>

                    {/* Lower Input Container */}
                    <Animated.View
                        style={[
                            styles.formContainer,
                            {
                                backgroundColor: colors.background,
                                borderTopLeftRadius: scaleFont(24),
                                borderTopRightRadius: scaleFont(24),
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }]
                            }
                        ]}
                    >
                        {/* Healthcare Welcome Illustration */}
                        <Image
                            source={require("../../../assets/branding/login_illustration.png")}
                            style={styles.illustration}
                            resizeMode="contain"
                        />

                        <View style={[styles.formCard, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
                                Verify Your Phone
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                                We have sent a 6-digit verification code to <Text style={{ fontWeight: 'bold', color: colors.text }}>{phone}</Text>. Please enter it below.
                            </Text>

                            <AppInput
                                placeholder="Enter 6-digit code"
                                label="Verification Code"
                                value={otpCode}
                                onChangeText={(text) => {
                                    // Limit to 6 digits, only numbers
                                    const cleaned = text.replace(/[^0-9]/g, '').substring(0, 6);
                                    setOtpCode(cleaned);
                                    if (errorMessage) setErrorMessage('');
                                }}
                                keyboardType="number-pad"
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isVerifying}
                                leftIcon={Lock}
                            />

                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

                            <AppButton
                                title={isVerifying ? "Verifying OTP..." : "Verify OTP"}
                                onPress={handleVerifyOTP}
                                loading={isVerifying}
                                style={styles.verifyButton}
                            />

                            <View style={styles.resendContainer}>
                                {cooldown > 0 ? (
                                    <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                                        Resend code in {cooldown}s
                                    </Text>
                                ) : (
                                    <Pressable 
                                        disabled={isResending} 
                                        onPress={handleResendOTP}
                                        style={({ pressed }) => [
                                            styles.resendPressable,
                                            pressed && styles.pressedEffect
                                        ]}
                                    >
                                        <RefreshCw size={scaleFont(14)} color={colors.primary} style={{ marginRight: spacing.xs }} />
                                        <Text style={[styles.resendLink, { color: colors.primary }]}>
                                            {isResending ? "Resending..." : "Resend Code"}
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default OTPVerificationScreen;

const styles = StyleSheet.create({
    keyboardContainer: {
        flex: 1,
    },
    illustration: {
        width: '100%',
        height: hp(11),
        alignSelf: 'center',
        marginBottom: hp(2),
        marginTop: hp(1),
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.23,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(2),
        position: 'relative',
    },
    backButton: {
        position: 'absolute',
        left: wp(4),
        top: Platform.OS === 'ios' ? hp(6) : hp(3),
        padding: 8,
        zIndex: 10,
    },
    logoContainer: {
        marginBottom: hp(0.5),
    },
    logoOutline: {
        padding: 4,
        borderWidth: 1,
        borderRadius: 24,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    appTitle: {
        fontSize: scaleFont(25),
        fontWeight: 'bold',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    appSubtitle: {
        fontSize: scaleFont(12.5),
        color: 'rgba(255, 255, 255, 0.9)',
        textAlign: 'center',
        marginTop: 4,
        fontWeight: '600',
    },
    tagline: {
        fontSize: scaleFont(10.5),
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginTop: 6,
        fontStyle: 'italic',
    },
    formContainer: {
        flex: 1,
        marginTop: -20,
        paddingHorizontal: wp(5),
        paddingTop: hp(2.5),
        paddingBottom: hp(2.5),
    },
    formCard: {
        padding: wp(5),
        elevation: 4,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: hp(0.5),
    },
    subtitle: {
        marginBottom: hp(2),
        lineHeight: 18,
    },
    verifyButton: {
        marginTop: hp(1),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginBottom: hp(1.5),
        fontSize: scaleFont(13),
    },
    resendContainer: {
        marginTop: hp(2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    resendText: {
        fontSize: scaleFont(13),
    },
    resendPressable: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    resendLink: {
        fontSize: scaleFont(13),
        fontWeight: '600',
    },
    pressedEffect: {
        opacity: 0.75,
    },
});
