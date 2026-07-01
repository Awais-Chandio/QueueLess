import React, { useState, useRef, useEffect } from "react";
import { 
    View, 
    StyleSheet, 
    Text, 
    Pressable, 
    Animated as RNAnimated, 
    Dimensions, 
    KeyboardAvoidingView, 
    Platform, 
    ScrollView, 
    Image,
    TextInput as RNTextInput 
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { Lock, ArrowLeft, RefreshCw, Check } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSequence, 
    withTiming, 
    withSpring 
} from "react-native-reanimated";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
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
    const { verifyPhoneOTP, loginWithPhone } = useAuth();

    const { phone } = route.params;

    const [otpCode, setOtpCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    // References for input focus
    const inputRef = useRef<RNTextInput>(null);

    // Reanimated Shared Values
    const shakeOffset = useSharedValue(0);
    const successScale = useSharedValue(0);

    // Mount animations
    const fadeAnim = useRef(new RNAnimated.Value(0)).current;
    const slideAnim = useRef(new RNAnimated.Value(30)).current;
    const logoScale = useRef(new RNAnimated.Value(0.85)).current;

    useEffect(() => {
        RNAnimated.parallel([
            RNAnimated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }),
            RNAnimated.timing(slideAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }),
            RNAnimated.spring(logoScale, {
                toValue: 1,
                friction: 6,
                tension: 40,
                useNativeDriver: true,
            })
        ]).start();

        // Auto-focus input on mount
        setTimeout(() => {
            inputRef.current?.focus();
        }, 600);
    }, []);

    // Cooldown timer logic
    useEffect(() => {
        if (cooldown === 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    // Shake animation trigger
    const triggerShake = () => {
        shakeOffset.value = withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(0, { duration: 50 })
        );
    };

    const shakeAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: shakeOffset.value }]
        };
    });

    const successAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: successScale.value }]
        };
    });

    // Auto-submit logic when 6 digits are typed
    useEffect(() => {
        if (otpCode.length === 6) {
            handleVerifyOTP();
        }
    }, [otpCode]);

    const handleVerifyOTP = async () => {
        if (isVerifying || isSuccess) return;

        const cleanOtp = otpCode.trim();
        if (!cleanOtp) {
            const msg = "Verification code is required";
            setErrorMessage(msg);
            toastService.error(msg);
            triggerShake();
            return;
        }

        if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
            const msg = "Please enter a valid 6-digit numeric OTP";
            setErrorMessage(msg);
            toastService.error(msg);
            triggerShake();
            return;
        }

        try {
            setErrorMessage('');
            setIsVerifying(true);
            const firebaseUser = await verifyPhoneOTP(cleanOtp);
            if (__DEV__) {
                console.log('[OTPVerificationScreen] Verification success. Firebase User:', firebaseUser);
            }
            
            // Trigger success animation
            setIsSuccess(true);
            successScale.value = withSpring(1, { damping: 10, stiffness: 80 });
            toastService.success('Logged in successfully');
        } catch (error) {
            // Shake on invalid OTP
            triggerShake();
            setOtpCode('');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 250);
            
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
            setOtpCode('');
            await loginWithPhone(phone);
            setCooldown(RESEND_COOLDOWN);
            toastService.success('OTP code re-sent successfully');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 250);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to resend OTP';
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsResending(false);
        }
    };

    // Render individual OTP cells
    const renderOtpCells = () => {
        const cells = [];
        for (let i = 0; i < 6; i++) {
            const char = otpCode[i] || '';
            const isFocused = otpCode.length === i;
            
            cells.push(
                <Pressable
                    key={i}
                    style={[
                        styles.otpCell,
                        { 
                            borderColor: isFocused ? colors.primary : colors.border,
                            backgroundColor: colors.surface,
                            borderRadius: radius.borderRadius
                        }
                    ]}
                    onPress={() => inputRef.current?.focus()}
                >
                    {isSuccess ? (
                        <Animated.View style={successAnimatedStyle}>
                            <Check size={20} color={colors.success || '#10B981'} />
                        </Animated.View>
                    ) : (
                        <Text style={[styles.otpCellText, { color: colors.text }]}>{char}</Text>
                    )}
                </Pressable>
            );
        }
        return cells;
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

                        <Animated.View style={[styles.formCard, shakeAnimatedStyle, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
                                Verify Your Phone
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                                We have sent a 6-digit verification code to <Text style={{ fontWeight: 'bold', color: colors.text }}>{phone}</Text>. Please enter it below.
                            </Text>

                            {/* Hidden TextInput for OTP processing */}
                            <RNTextInput
                                ref={inputRef}
                                value={otpCode}
                                onChangeText={(text) => {
                                    const cleaned = text.replace(/[^0-9]/g, '').substring(0, 6);
                                    setOtpCode(cleaned);
                                    if (errorMessage) setErrorMessage('');
                                }}
                                keyboardType="number-pad"
                                maxLength={6}
                                caretHidden={true}
                                style={styles.hiddenInput}
                                autoComplete="one-time-code"
                                textContentType="oneTimeCode"
                                editable={!isVerifying && !isSuccess}
                            />

                            {/* Beautiful 6-digit row */}
                            <View style={styles.otpRowContainer}>
                                {renderOtpCells()}
                            </View>

                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

                            <AppButton
                                title={isSuccess ? "Verified" : (isVerifying ? "Verifying OTP..." : "Verify OTP")}
                                onPress={handleVerifyOTP}
                                loading={isVerifying}
                                style={{
                                    ...styles.verifyButton,
                                    ...(isSuccess ? { backgroundColor: colors.success || '#10B981' } : {})
                                }}
                                disabled={isSuccess}
                            />

                            <View style={styles.resendContainer}>
                                {cooldown > 0 ? (
                                    <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                                        Resend code in {cooldown}s
                                    </Text>
                                ) : (
                                    <Pressable 
                                        disabled={isResending || isSuccess} 
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
                        </Animated.View>
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
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        zIndex: -1,
    },
    otpRowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        width: '100%',
        paddingHorizontal: 5,
    },
    otpCell: {
        width: wp(11),
        height: wp(13),
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    otpCellText: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
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
