import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StaffDashboardScreen from '../screens/StaffDashboardScreen';
import CheckInScreen from '../screens/CheckInScreen';

export type StaffStackParamList = {
  StaffDashboard: undefined;
  CheckIn: undefined;
};

const Stack = createNativeStackNavigator<StaffStackParamList>();

const StaffNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="StaffDashboard">
    <Stack.Screen name="StaffDashboard" component={StaffDashboardScreen} />
    <Stack.Screen name="CheckIn" component={CheckInScreen} />
  </Stack.Navigator>
);

export default StaffNavigator;
