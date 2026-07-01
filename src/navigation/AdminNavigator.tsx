import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminTabs from './AdminTabs';
import CreateAccountScreen from '../features/admin/components/CreateAccountScreen';
import ManageCentersScreen from '../features/admin/components/ManageCentersScreen';

export type AdminStackParamList = {
  AdminDashboard: undefined;
  CreateAccount: { role: 'staff' | 'admin' };
  ManageCenters: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

const AdminNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboard" component={AdminTabs} />
    <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
    <Stack.Screen name="ManageCenters" component={ManageCentersScreen} />
  </Stack.Navigator>
);

export default AdminNavigator;
