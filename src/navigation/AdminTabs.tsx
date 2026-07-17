import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
