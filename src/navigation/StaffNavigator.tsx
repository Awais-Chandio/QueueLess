import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StaffDashboardScreen from '../features/staff/components/StaffDashboardScreen';

export type StaffStackParamList = {
  StaffDashboard: undefined;
};

const Stack = createNativeStackNavigator<StaffStackParamList>();

const StaffNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="StaffDashboard" component={StaffDashboardScreen} />
  </Stack.Navigator>
);

export default StaffNavigator;
