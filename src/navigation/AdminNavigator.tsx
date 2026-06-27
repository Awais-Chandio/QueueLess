import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminDashboardScreen from '../features/admin/components/AdminDashboardScreen';
import CreateAccountScreen from '../features/admin/components/CreateAccountScreen';

export type AdminStackParamList = {
  AdminDashboard: undefined;
  CreateAccount: { role: 'staff' | 'admin' };
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

const AdminNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
  </Stack.Navigator>
);

export default AdminNavigator;
