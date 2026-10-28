import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, Users } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useStaffPush } from '../../../hooks/useStaffPush';
import { useAuthStore } from '../../../store/authStore';
import { hp } from '../../../utils/responsive';
import ReceptionScreen from '../screens/ReceptionScreen';
import CheckInScreen from '../screens/CheckInScreen';
import OwnerHomeScreen from '../screens/OwnerHomeScreen';
import { deskCenters } from '../hooks/useReception';

export type StaffStackParamList = {
  Main: undefined;
  Reception: undefined;
  CheckIn: undefined;
};

export type OwnerTabParamList = {
  HomeTab: undefined;
  ReceptionTab: undefined;
};

const Stack = createNativeStackNavigator<StaffStackParamList>();
const Tab = createBottomTabNavigator<OwnerTabParamList>();

type TabIconProps = { color: string; size: number };
const HomeTabIcon = ({ color, size }: TabIconProps) => <Home color={color} size={size} />;
const ReceptionTabIcon = ({ color, size }: TabIconProps) => <Users color={color} size={size} />;

/** Owner: "Today" (money at a glance) and the desk. Same floating bar as the doctor app. */
const OwnerTabs = () => {
  const { colors, spacing, typography } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
          start: spacing.md,
          end: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border + '40',
          height: hp(7.8),
          paddingBottom: Platform.OS === 'ios' ? spacing.xs : spacing.sm,
          paddingTop: spacing.sm,
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: typography.sizes.xs, fontWeight: '600', lineHeight: typography.sizes.sm },
        tabBarItemStyle: { paddingVertical: spacing.xs },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen name="HomeTab" component={OwnerHomeScreen} options={{ tabBarLabel: 'Today', tabBarIcon: HomeTabIcon }} />
      <Tab.Screen name="ReceptionTab" component={ReceptionScreen} options={{ tabBarLabel: 'Reception', tabBarIcon: ReceptionTabIcon }} />
    </Tab.Navigator>
  );
};

/**
 * The clinic side of the app. Owners land on Today (with the desk one tab
 * away); receptionists get the desk only. QR check-in sits on top of either.
 */
const StaffNavigator = () => {
  useStaffPush();
  const workspaces = useAuthStore(state => state.workspaces);
  const isOwner = deskCenters(workspaces).some(center => center.isOwner);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={isOwner ? 'Main' : 'Reception'}>
      {isOwner ? <Stack.Screen name="Main" component={OwnerTabs} /> : <Stack.Screen name="Reception" component={ReceptionScreen} />}
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
    </Stack.Navigator>
  );
};

export default StaffNavigator;
