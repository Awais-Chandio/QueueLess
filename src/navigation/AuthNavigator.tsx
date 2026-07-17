import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import OnboardingScreen from "../features/auth/components/OnboardingScreen";
import LoginScreen from "../features/auth/components/LoginScreen";
import SignupScreen from "../features/auth/components/SignupScreen";
import ForgotPasswordScreen from "../features/auth/components/ForgotPasswordScreen";
import ResetPasswordScreen from "../features/auth/components/ResetPasswordScreen";
import PhoneLoginScreen from "../features/auth/components/PhoneLoginScreen";
import OTPVerificationScreen from "../features/auth/components/OTPVerificationScreen";
import { useAuthStore } from "../store/authStore";

export type AuthStackParamList = {
    Onboarding: undefined;
    Login: undefined;
    Signup: undefined;
    ForgotPassword: undefined;
    ResetPassword: undefined;
    PhoneLogin: undefined;
    OTPVerification: { phone: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();
const AuthNavigator = () => {
    const isPasswordRecovery = useAuthStore(state => state.isPasswordRecovery);

    return (
        <Stack.Navigator
            initialRouteName={isPasswordRecovery ? "ResetPassword" : "Onboarding"}
            screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
            <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
        </Stack.Navigator>
    )
}
export default AuthNavigator;
