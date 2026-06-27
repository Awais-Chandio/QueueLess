import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Text, Pressable, Animated, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Mail, Lock, KeyRound } from "lucide-react-native";
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

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LoginScreen = () => {
    const { colors, spacing, typography, radius } = useTheme();
    const navigation = useNavigation<LoginScreenNavigationProp>();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const { login, isLoading } = useAuth();

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
                        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
                            <View style={styles.logoOutline}>
                                <MedicalLogo size={scaleFont(48)} qColor="#FFFFFF" crossColor="#14B8A6" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Text style={styles.appTitle}>QueueLess</Text>
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
                            <AppInput
                                placeholder="Email"
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
                                    <KeyRound size={scaleFont(14)} color={colors.primary} style={{ marginRight: spacing.xs }} />
                                    <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
                                </Pressable>
                            </View>

                            <AppButton
                                title={isLoading ? "Logging in..." : "Login"}
                                onPress={handleLogin}
                                loading={isLoading}
                                style={styles.loginButton}
                            />
                            
                            {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
                        </View>

                        <Pressable 
                            onPress={() => navigation.navigate("Signup")}
                            style={({ pressed }) => [
                                styles.signupLinkContainer,
                                pressed && styles.pressedEffect
                            ]}
                        >
                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                Don't have an account? <Text style={{ color: colors.primary, fontWeight: '700' }}>Sign Up</Text>
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
    illustration: {
        width: '100%',
        height: hp(11),
        alignSelf: 'center',
        marginBottom: hp(1),
        marginTop: hp(0.5),
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.21,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(1),
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
        paddingTop: hp(1.5),
        paddingBottom: hp(1.5),
    },
    formCard: {
        padding: wp(4.5),
        elevation: 4,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
    },
    forgotPasswordRow: {
        alignItems: 'flex-end',
        marginBottom: hp(2),
    },
    forgotPasswordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    forgotPasswordText: {
        fontSize: scaleFont(13),
        fontWeight: '600',
    },
    loginButton: {
        marginTop: hp(1),
    },
    errorMessage: {
        color: '#EF4444',
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
    },
    signupLinkContainer: {
        marginTop: hp(3),
        alignItems: 'center',
        paddingVertical: 8,
    },
    footerText: {
        fontSize: scaleFont(14),
    },
    pressedEffect: {
        opacity: 0.75,
    },
});
