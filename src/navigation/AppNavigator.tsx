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

const Stack = createNativeStackNavigator<AppStackParamList>();

const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={AppTabs} />
      <Stack.Screen name="CenterDetails" component={CenterDetailsScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="AppointmentDetails" component={AppointmentDetailsScreen} />
      <Stack.Screen name="QueueStatus" component={QueueStatusScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
    </Stack.Navigator>
  );
};

export default AppNavigator;
