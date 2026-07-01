import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Text, Pressable, Animated, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Phone, ArrowLeft } from "lucide-react-native";
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

type PhoneLoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "PhoneLogin">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PhoneLoginScreen = () => {
    const { colors, spacing, typography, radius } = useTheme();
    const navigation = useNavigation<PhoneLoginScreenNavigationProp>();
    const { sendPhoneOtp } = useAuth();

    const [phone, setPhone] = useState('');
    const [isSending, setIsSending] = useState(false);
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

    const handleSendOTP = async () => {
        if (isSending) return;

        let formattedPhone = phone.trim();
        if (!formattedPhone) {
            const msg = "Phone number is required";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        // Format to +92XXXXXXXXXX format (or generic international digits)
        // Remove spaces, hyphens, and parentheses
        formattedPhone = formattedPhone.replace(/[\s\-()]/g, '');

        if (formattedPhone.startsWith('03')) {
            formattedPhone = '+92' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('3') && formattedPhone.length === 10) {
            formattedPhone = '+92' + formattedPhone;
        } else if (formattedPhone.startsWith('923') && formattedPhone.length === 12) {
            formattedPhone = '+' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('92')) {
                formattedPhone = '+' + formattedPhone;
            } else {
                formattedPhone = '+92' + formattedPhone;
            }
        }

        // E.164 verification: + followed by 10 to 15 digits
        const phoneRegex = /^\+[1-9]\d{10,14}$/;
        if (!phoneRegex.test(formattedPhone)) {
            const msg = "Please enter a valid phone number (e.g. 03001234567)";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        try {
            setErrorMessage('');
            setIsSending(true);
            await sendPhoneOtp(formattedPhone);
            toastService.success('OTP sent successfully');
            navigation.navigate("OTPVerification", { phone: formattedPhone });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send OTP';
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsSending(false);
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
                            <Text style={styles.tagline}>OTP Authentication</Text>
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
                                Login with Phone
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                                We will send you a one-time verification code via SMS.
                            </Text>

                            <AppInput
                                placeholder="e.g. 03001234567 or +923001234567"
                                label="Phone Number"
                                value={phone}
                                onChangeText={(text) => {
                                    setPhone(text);
                                    if (errorMessage) setErrorMessage('');
                                }}
                                keyboardType="phone-pad"
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isSending}
                                leftIcon={Phone}
                            />

                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

                            <AppButton
                                title={isSending ? "Sending OTP..." : "Send OTP"}
                                onPress={handleSendOTP}
                                loading={isSending}
                                style={styles.sendButton}
                            />
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default PhoneLoginScreen;

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
    sendButton: {
        marginTop: hp(1),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginBottom: hp(1.5),
        fontSize: scaleFont(13),
    },
});
