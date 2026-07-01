import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { hp } from '../utils/responsive';

// Screens
import AdminAnalyticsScreen from '../features/admin/components/AdminAnalyticsScreen';
import AdminLogsScreen from '../features/admin/components/AdminLogsScreen';
import AdminManageScreen from '../features/admin/components/AdminManageScreen';

// Icons
import { TrendingUp, History, Settings } from 'lucide-react-native';

export type AdminTabParamList = {
  Analytics: undefined;
  ActivityLogs: undefined;
  Management: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

type TabIconProps = {
  color: string;
  size: number;
};

const AnalyticsTabIcon = ({ color, size }: TabIconProps) => (
  <TrendingUp color={color} size={size} />
);

const LogsTabIcon = ({ color, size }: TabIconProps) => (
  <History color={color} size={size} />
);

const ManageTabIcon = ({ color, size }: TabIconProps) => (
  <Settings color={color} size={size} />
);

const AdminTabs = () => {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const bottomInset = Math.max(
    insets.bottom,
    Platform.OS === 'android' ? spacing.xl : spacing.sm,
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: hp(8) + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: spacing.sm,
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
        name="Analytics"
        component={AdminAnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: AnalyticsTabIcon,
        }}
      />
      <Tab.Screen
        name="ActivityLogs"
        component={AdminLogsScreen}
        options={{
          tabBarLabel: 'Logs',
          tabBarIcon: LogsTabIcon,
        }}
      />
      <Tab.Screen
        name="Management"
        component={AdminManageScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ManageTabIcon,
        }}
      />
    </Tab.Navigator>
  );
};

export default AdminTabs;
