import React, { useState, useRef, useEffect } from "react";
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
    Modal,
    FlatList,
    TextInput as RNTextInput 
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import { LinearGradient } from "react-native-linear-gradient";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import AppButton from "../../../components/ui/AppButton";
import { useAuth } from "../../../hooks/useAuth";
import type { AuthStackParamList } from "../../../navigation/AuthNavigator";
import { toastService } from "../../../services/toastService";
import MedicalLogo from "../../../components/ui/MedicalLogo";
import { hp, scaleFont, wp } from "../../../utils/responsive";

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
    const { colors, typography, radius, spacing } = useTheme();
    const navigation = useNavigation<PhoneLoginScreenNavigationProp>();
    const { sendPhoneOtp } = useAuth();

    const [phone, setPhone] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [showCountryModal, setShowCountryModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
    }, [fadeAnim, logoScale, slideAnim]);

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
                                borderTopLeftRadius: radius.xl,
                                borderTopRightRadius: radius.xl,
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

                        <View style={[styles.formCard, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
                            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
                                Login with Phone
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                                We will send you a one-time verification code via SMS.
                            </Text>

                            {/* Beautiful Integrated Phone Input */}
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.text, fontSize: typography.sizes.xs, marginBottom: spacing.xs }]}>Phone Number</Text>
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
                                        style={[styles.phoneInputField, { color: colors.text }]}
                                        editable={!isSending}
                                    />
                                </View>
                            </View>

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

            {/* Custom Country Picker Modal */}
            <Modal
                visible={showCountryModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowCountryModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Country</Text>
                            <Pressable onPress={() => { setShowCountryModal(false); setSearchQuery(''); }}>
                                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Close</Text>
                            </Pressable>
                        </View>
                        
                        <RNTextInput
                            placeholder="Search country..."
                            placeholderTextColor={colors.textTertiary}
                            style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md }]}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        
                        <FlatList
                            data={filteredCountries}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <Pressable
                                    style={[styles.countryItem, { borderBottomColor: colors.border }]}
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
                            )}
                        />
                    </View>
                </View>
            </Modal>
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
        paddingTop: hp(2.5),
        paddingBottom: hp(2.5),
    },
    formCard: {
        padding: wp(5),
        elevation: 4,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        borderWidth: Platform.OS === 'ios' ? 0 : 1,
        borderColor: '#E2E8F0',
    },
    title: {
        fontWeight: '700',
        marginBottom: hp(0.5),
    },
    subtitle: {
        marginBottom: hp(2),
        lineHeight: 18,
    },
    inputWrapper: {
        width: '100%',
        marginBottom: 15,
    },
    inputLabel: {
        fontWeight: '600',
    },
    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        height: 54,
    },
    countryPickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: '100%',
    },
    flagText: {
        fontSize: 20,
        marginRight: 6,
    },
    codeText: {
        fontSize: 15,
        fontWeight: '600',
    },
    verticalSeparator: {
        width: 1,
        height: '60%',
    },
    phoneInputField: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        fontSize: 16,
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        padding: 20,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    searchInput: {
        height: 48,
        borderWidth: 1.5,
        paddingHorizontal: 15,
        marginBottom: 15,
    },
    countryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    countryFlag: {
        fontSize: 24,
        marginRight: 15,
    },
    countryName: {
        flex: 1,
        fontSize: 16,
    },
    countryCode: {
        fontSize: 16,
        fontWeight: '600',
    },
});
