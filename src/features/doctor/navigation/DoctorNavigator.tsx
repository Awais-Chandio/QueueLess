import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../../hooks/useTheme';
import { hp } from '../../../utils/responsive';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import PatientsScreen from '../screens/PatientsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AvailabilityScreen from '../screens/AvailabilityScreen';
import LeaveManagementScreen from '../screens/LeaveManagementScreen';

// Icons
import { LayoutDashboard, Calendar, Users, User, Clock } from 'lucide-react-native';

export type AvailabilityStackParamList = {
  AvailabilityMain: undefined;
  LeaveManagement: undefined;
};

const Stack = createNativeStackNavigator<AvailabilityStackParamList>();

const AvailabilityStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AvailabilityMain">
    <Stack.Screen name="AvailabilityMain" component={AvailabilityScreen} />
    <Stack.Screen name="LeaveManagement" component={LeaveManagementScreen} />
  </Stack.Navigator>
);

export type DoctorTabParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Patients: undefined;
  Availability: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<DoctorTabParamList>();

type TabIconProps = {
  color: string;
  size: number;
};

const DashboardTabIcon = ({ color, size }: TabIconProps) => (
  <LayoutDashboard color={color} size={size} />
);

const ScheduleTabIcon = ({ color, size }: TabIconProps) => (
  <Calendar color={color} size={size} />
);

const PatientsTabIcon = ({ color, size }: TabIconProps) => (
  <Users color={color} size={size} />
);

const AvailabilityTabIcon = ({ color, size }: TabIconProps) => (
  <Clock color={color} size={size} />
);

const ProfileTabIcon = ({ color, size }: TabIconProps) => (
  <User color={color} size={size} />
);

const DoctorNavigator = () => {
  const { colors, spacing, typography } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
          left: spacing.md,
          right: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border + '40',
          height: hp(7.8),
          paddingBottom: Platform.OS === 'ios' ? spacing.xs : spacing.sm,
          paddingTop: spacing.sm,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: '600',
          lineHeight: typography.sizes.sm,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xs,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: DashboardTabIcon,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ScheduleTabIcon,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={PatientsScreen}
        options={{
          tabBarLabel: 'Patients',
          tabBarIcon: PatientsTabIcon,
        }}
      />
      <Tab.Screen
        name="Availability"
        component={AvailabilityStackNavigator}
        options={{
          tabBarLabel: 'Availability',
          tabBarIcon: AvailabilityTabIcon,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tab.Navigator>
  );
};

export default DoctorNavigator;
