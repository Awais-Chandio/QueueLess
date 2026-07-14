import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminTabs from './AdminTabs';
import CreateAccountScreen from '../features/admin/components/CreateAccountScreen';
import ManageCentersScreen from '../features/admin/components/ManageCentersScreen';
import ManageDoctorsScreen from '../features/admin/components/ManageDoctorsScreen';
import AddDoctorScreen from '../features/admin/components/AddDoctorScreen';
import EditDoctorScreen from '../features/admin/components/EditDoctorScreen';

export type AdminStackParamList = {
  AdminDashboard: undefined;
  CreateAccount: { role: 'staff' | 'admin' };
  ManageCenters: undefined;
  ManageDoctors: undefined;
  AddDoctor: undefined;
  EditDoctor: { doctorId: string };
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

const AdminNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboard" component={AdminTabs} />
    <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
    <Stack.Screen name="ManageCenters" component={ManageCentersScreen} />
    <Stack.Screen name="ManageDoctors" component={ManageDoctorsScreen} />
    <Stack.Screen name="AddDoctor" component={AddDoctorScreen} />
    <Stack.Screen name="EditDoctor" component={EditDoctorScreen} />
  </Stack.Navigator>
);

export default AdminNavigator;
