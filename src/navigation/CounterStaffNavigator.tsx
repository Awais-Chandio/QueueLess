import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CenterQueueScreen from '../screens/counter/CenterQueueScreen';
import CheckInScreen from '../screens/counter/CheckInScreen';
import QueueSettingsScreen from '../screens/counter/QueueSettingsScreen';

export type CounterStaffStackParamList = {
  CenterQueue: undefined;
  CheckIn: undefined;
  QueueSettings: undefined;
};

const Stack = createNativeStackNavigator<CounterStaffStackParamList>();

const CounterStaffNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="CenterQueue">
    <Stack.Screen name="CenterQueue" component={CenterQueueScreen} />
    <Stack.Screen name="CheckIn" component={CheckInScreen} />
    <Stack.Screen name="QueueSettings" component={QueueSettingsScreen} />
  </Stack.Navigator>
);

export default CounterStaffNavigator;
