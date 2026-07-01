import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AppTabs from "./AppTabs";
import CenterDetailsScreen from "../features/centers/components/CenterDetailsScreen";
import BookAppointmentScreen from "../features/appointments/components/BookAppointmentScreen";
import AppointmentDetailsScreen from "../features/appointments/components/AppointmentDetailsScreen";
import QueueStatusScreen from "../features/appointments/components/QueueStatusScreen";
import EditProfileScreen from "../features/profile/components/EditProfileScreen";
import SettingsScreen from "../features/profile/components/SettingsScreen";
import {
  AboutScreen,
  PrivacyPolicyScreen,
  TermsScreen,
} from "../features/profile/components/InfoScreens";
import type { AppStackParamList } from "./types";
import { useTheme } from "../hooks/useTheme";

const Stack = createNativeStackNavigator<AppStackParamList>();

const AppNavigator = () => {
  const { colors, typography } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontSize: typography.sizes.md,
          fontWeight: "bold",
          color: colors.text,
        },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={AppTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CenterDetails"
        component={CenterDetailsScreen}
        options={{ title: "Center Details" }}
      />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AppointmentDetails"
        component={AppointmentDetailsScreen}
        options={{ title: "Appointment Details" }}
      />
      <Stack.Screen
        name="QueueStatus"
        component={QueueStatusScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: "Edit Profile" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: "Privacy Policy" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About" }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ title: "Terms & Conditions" }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
