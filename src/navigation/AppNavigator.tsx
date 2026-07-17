import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AppTabs from "./AppTabs";
import CentersScreen from "../features/centers/components/CentersScreen";
import CenterDetailsScreen from "../features/centers/components/CenterDetailsScreen";
import BookAppointmentScreen from "../features/appointments/components/BookAppointmentScreen";
import SelectSlotScreen from "../features/appointments/components/SelectSlotScreen";
import PatientDetailsScreen from "../features/appointments/components/PatientDetailsScreen";
import ConfirmBookingScreen from "../features/appointments/components/ConfirmBookingScreen";
import ReceiptScreen from "../features/appointments/components/ReceiptScreen";
import NearbyClinicsScreen from "../features/centers/components/NearbyClinicsScreen";
import AppointmentDetailsScreen from "../features/appointments/components/AppointmentDetailsScreen";
import QueueStatusScreen from "../features/appointments/components/QueueStatusScreen";
import DoctorListScreen from "../features/appointments/components/DoctorListScreen";
import DoctorSearchScreen from "../features/appointments/components/DoctorSearchScreen";
import PublicDoctorProfileScreen from "../features/appointments/components/PublicDoctorProfileScreen";
import ClinicSelectionScreen from "../features/appointments/components/ClinicSelectionScreen";
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
        name="DoctorList"
        component={DoctorListScreen}
        options={{ title: "Select Doctor", headerShown: false }}
      />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Centers"
        component={CentersScreen}
        options={{ title: "Select Clinic" }}
      />
      <Stack.Screen
        name="SelectSlot"
        component={SelectSlotScreen}
        options={{ title: "Select Slot", headerShown: false }}
      />
      <Stack.Screen
        name="PatientDetails"
        component={PatientDetailsScreen}
        options={{ title: "Patient Details", headerShown: false }}
      />
      <Stack.Screen
        name="ConfirmBooking"
        component={ConfirmBookingScreen}
        options={{ title: "Confirm Booking", headerShown: false }}
      />
      <Stack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: "Receipt", headerShown: false }}
      />
      <Stack.Screen
        name="NearbyClinics"
        component={NearbyClinicsScreen}
        options={{ title: "Nearby Clinics", headerShown: false }}
      />
      <Stack.Screen
        name="DoctorSearch"
        component={DoctorSearchScreen}
        options={{ title: "Doctor Search", headerShown: false }}
      />
      <Stack.Screen
        name="PublicDoctorProfile"
        component={PublicDoctorProfileScreen}
        options={{ title: "Doctor Profile", headerShown: false }}
      />
      <Stack.Screen
        name="ClinicSelection"
        component={ClinicSelectionScreen}
        options={{ title: "Select Clinic", headerShown: false }}
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
