import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AppTabs from "./AppTabs";
import CenterDetailsScreen from "../screens/centers/CenterDetailsScreen";
import BookAppointmentScreen from "../screens/appointments/BookAppointmentScreen";
import AppointmentDetailsScreen from "../screens/appointments/AppointmentDetailsScreen";
import QueueStatusScreen from "../screens/appointments/QueueStatusScreen";
import EditProfileScreen from "../screens/profile/EditProfileScreen";
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
    </Stack.Navigator>
  );
};

export default AppNavigator;
