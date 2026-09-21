import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DoctorQueueScreen from '../screens/doctor/DoctorQueueScreen';
import DoctorScheduleScreen from '../screens/doctor/DoctorScheduleScreen';
import DoctorProfileScreen from '../screens/doctor/DoctorProfileScreen';

export type DoctorStackParamList = {
  DoctorQueue: undefined;
  DoctorSchedule: undefined;
  DoctorProfile: undefined;
};

const Stack = createNativeStackNavigator<DoctorStackParamList>();

const DoctorNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="DoctorQueue">
    <Stack.Screen name="DoctorQueue" component={DoctorQueueScreen} />
    <Stack.Screen name="DoctorSchedule" component={DoctorScheduleScreen} />
    <Stack.Screen name="DoctorProfile" component={DoctorProfileScreen} />
  </Stack.Navigator>
);

export default DoctorNavigator;
