import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ReceptionScreen from '../screens/ReceptionScreen';
import CheckInScreen from '../screens/CheckInScreen';

export type StaffStackParamList = {
  Reception: undefined;
  CheckIn: undefined;
};

const Stack = createNativeStackNavigator<StaffStackParamList>();

const StaffNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Reception">
    <Stack.Screen name="Reception" component={ReceptionScreen} />
    <Stack.Screen name="CheckIn" component={CheckInScreen} />
  </Stack.Navigator>
);

export default StaffNavigator;
