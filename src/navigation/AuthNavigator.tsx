import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import LoginScreen from "../features/auth/components/LoginScreen";
import SignupScreen from "../features/auth/components/SignupScreen";

export type AuthStackParamList = {
    Login: undefined;
    Signup: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();
const AuthNavigator = () => {
    return (
        <Stack.Navigator
            screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />

        </Stack.Navigator>
    )
}
export default AuthNavigator;
