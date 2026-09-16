import React, { useState } from "react";
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
    TextInput as RNTextInput
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft, ChevronDown, Search } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppButton from "../../../components/ui/AppButton";
import AppBottomSheet from "../../../components/ui/AppBottomSheet";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import Floating3DLogo from "../../../components/ui/Floating3DLogo";
import Wordmark from "../../../components/ui/Wordmark";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import { useAuthEntranceAnimation } from "../hooks/useAuthEntranceAnimation";

type PhoneLoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, "PhoneLogin">;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const COUNTRIES = [
    { code: '+92', flag: '🇵🇰', name: 'Pakistan' },
    { code: '+1', flag: '🇺🇸', name: 'United States' },
    { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
    { code: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
];

const PhoneLoginScreen = () => {
    const { colors, typography, radius, spacing, isDarkMode } = useTheme();
    const navigation = useNavigation<PhoneLoginScreenNavigationProp>();
    const { sendPhoneOtp } = useAuth();

    const [phone, setPhone] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [showCountryModal, setShowCountryModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const { fadeAnim, slideAnim, logoScale } = useAuthEntranceAnimation();

    const filteredCountries = COUNTRIES.filter(country => 
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.code.includes(searchQuery)
    );

    const handleSendOTP = async () => {
        if (isSending) return;

        let formattedPhone = phone.trim();
        if (!formattedPhone) {
            const msg = "Phone number is required";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        // Remove spaces, hyphens, parentheses, and leading zeros
        formattedPhone = formattedPhone.replace(/[\s\-()]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = formattedPhone.substring(1);
        }

        const finalPhone = selectedCountry.code + formattedPhone;

        // E.164 verification: + followed by 10 to 15 digits
        const phoneRegex = /^\+[1-9]\d{10,14}$/;
        if (!phoneRegex.test(finalPhone)) {
            const msg = "Please enter a valid phone number";
            setErrorMessage(msg);
            toastService.error(msg);
            return;
        }

        try {
            setErrorMessage('');
            setIsSending(true);
            await sendPhoneOtp(finalPhone);
            toastService.success('OTP sent successfully');
            navigation.navigate("OTPVerification", { phone: finalPhone });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send OTP';
            setErrorMessage(message);
            toastService.error(message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <ScreenWrapper scrollable={false} withPadding={false}>
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {/* Upper Gradient Header */}
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
                                <Floating3DLogo size={scaleFont(46)} qColor="#FFFFFF" />
                            </View>
                        </Animated.View>

                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Wordmark size={26} tone="onColor" />
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
                                borderTopLeftRadius: radius.xxl,
                                borderTopRightRadius: radius.xxl,
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

                        <View style={[
                            styles.formCard, 
                            { 
                                backgroundColor: colors.surface, 
                                borderRadius: radius.xl,
                                shadowColor: isDarkMode ? '#000000' : colors.primary,
                                shadowOffset: { width: 0, height: 8 },
                                shadowOpacity: isDarkMode ? 0.3 : 0.05,
                                shadowRadius: 20,
                                elevation: 4,
                                borderColor: colors.border + '60',
                                borderWidth: 0.5
                            }
                        ]}>
                            <Text style={[styles.formTitle, { color: colors.text, fontSize: typography.sizes.lg }]}>
                                Login with Phone
                            </Text>
                            <Text style={[styles.formSubtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md }]}>
                                We will send you a one-time verification code via SMS.
                            </Text>

                            {/* Integrated Phone Input */}
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.text, fontSize: typography.sizes.xs, marginBottom: spacing.xs }]}>
                                    Phone Number
                                </Text>
                                <View style={[styles.phoneInputContainer, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.xl }]}>
                                    <Pressable 
                                        style={styles.countryPickerButton}
                                        onPress={() => setShowCountryModal(true)}
                                    >
                                        <Text style={styles.flagText}>{selectedCountry.flag}</Text>
                                        <Text style={[styles.codeText, { color: colors.text }]}>{selectedCountry.code}</Text>
                                        <ChevronDown size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
                                    </Pressable>
                                    <View style={[styles.verticalSeparator, { backgroundColor: colors.border }]} />
                                    <RNTextInput
                                        placeholder="300 1234567"
                                        placeholderTextColor={colors.textTertiary}
                                        keyboardType="phone-pad"
                                        value={phone}
                                        onChangeText={(text) => {
                                            const cleaned = text.replace(/[^0-9]/g, '');
                                            setPhone(cleaned);
                                            if (errorMessage) setErrorMessage('');
                                        }}
                                        style={[styles.phoneInputField, { color: colors.text, fontSize: typography.body }]}
                                        editable={!isSending}
                                    />
                                </View>
                            </View>

                            {errorMessage ? <Text style={[styles.errorMessage, { color: colors.error }]}>{errorMessage}</Text> : null}

                            <AppButton
                                title={isSending ? "Sending OTP..." : "Send OTP"}
                                onPress={handleSendOTP}
                                loading={isSending}
                                containerStyle={styles.sendButton}
                            />
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Country picker */}
            <AppBottomSheet
                visible={showCountryModal}
                onClose={() => { setShowCountryModal(false); setSearchQuery(''); }}
                title="Select Country"
                maxHeightPercent={0.65}
            >
                <View style={[styles.searchBarContainer, { backgroundColor: colors.background, borderRadius: radius.lg, borderColor: colors.border }]}>
                    <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
                    <RNTextInput
                        placeholder="Search country..."
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.searchInput, { color: colors.text }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {filteredCountries.map((item) => (
                    <Pressable
                        key={item.code}
                        style={[styles.countryItem, { borderBottomColor: colors.border + '50' }]}
                        onPress={() => {
                            setSelectedCountry(item);
                            setShowCountryModal(false);
                            setSearchQuery('');
                        }}
                    >
                        <Text style={styles.countryFlag}>{item.flag}</Text>
                        <Text style={[styles.countryName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.countryCode, { color: colors.textSecondary }]}>{item.code}</Text>
                    </Pressable>
                ))}
            </AppBottomSheet>
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
        marginBottom: hp(1.5),
        marginTop: hp(0.5),
    },
    scrollContainer: {
        flexGrow: 1,
    },
    headerGradient: {
        height: SCREEN_HEIGHT * 0.24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(6),
        paddingTop: hp(2),
    },
    backButton: {
        position: 'absolute',
        top: hp(2),
        left: wp(4),
        padding: 8,
        borderRadius: 999,
        zIndex: 10,
    },
    logoContainer: {
        marginBottom: hp(0.5),
    },
    logoOutline: {
        padding: 8,
        borderWidth: 1,
        borderRadius: 24,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
        marginTop: 4,
        fontStyle: 'italic',
    },
    formContainer: {
        flex: 1,
        marginTop: -24,
        paddingHorizontal: wp(5),
        paddingTop: hp(2),
        paddingBottom: hp(4),
    },
    formCard: {
        padding: wp(5),
    },
    formTitle: {
        fontWeight: '800',
        textAlign: 'center',
    },
    formSubtitle: {
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 18,
    },
    inputWrapper: {
        marginTop: hp(1),
    },
    inputLabel: {
        fontWeight: '600',
    },
    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        height: hp(5.6),
    },
    countryPickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(3.5),
        height: '100%',
    },
    flagText: {
        fontSize: scaleFont(18),
        marginRight: 4,
    },
    codeText: {
        fontSize: scaleFont(14),
        fontWeight: '700',
    },
    verticalSeparator: {
        width: 1,
        height: '60%',
    },
    phoneInputField: {
        flex: 1,
        height: '100%',
        paddingHorizontal: wp(3.5),
        fontWeight: '600',
    },
    errorMessage: {
        textAlign: 'center',
        marginTop: hp(1.5),
        fontSize: scaleFont(13),
        fontWeight: '600',
    },
    sendButton: {
        marginTop: hp(2),
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: hp(1),
        marginBottom: hp(1.5),
        borderWidth: 1,
        height: hp(5),
    },
    searchIcon: {
        marginLeft: 12,
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: '100%',
        paddingRight: wp(3),
        fontWeight: '600',
    },
    countryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(1.8),
        paddingHorizontal: wp(6),
        borderBottomWidth: 0.5,
    },
    countryFlag: {
        fontSize: scaleFont(20),
        marginRight: wp(4),
    },
    countryName: {
        flex: 1,
        fontSize: scaleFont(14),
        fontWeight: '600',
    },
    countryCode: {
        fontSize: scaleFont(14),
        fontWeight: '700',
    },
});
