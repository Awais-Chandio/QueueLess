import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../features/home/components/HomeScreen";
import CentersScreen from "../features/centers/components/CentersScreen";
import MyAppointmentsScreen from "../features/appointments/components/MyAppointmentsScreen";
import NotificationsScreen from "../features/notifications/components/NotificationsScreen";
import ProfileScreen from "../features/profile/components/ProfileScreen";
import type { AppTabParamList } from "./types";
import { useTheme } from "../hooks/useTheme";
import { Home, MapPin, Calendar, Bell, User } from "lucide-react-native";

const Tab = createBottomTabNavigator<AppTabParamList>();

const AppTabs = () => {
    const { colors, typography } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={{ 
                headerShown: false,
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                },
                tabBarLabelStyle: {
                    fontSize: typography.sizes.xs,
                    fontWeight: '500',
                }
            }}>
            <Tab.Screen 
                name="Home" 
                component={HomeScreen} 
                options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
            />
            <Tab.Screen 
                name="Centers" 
                component={CentersScreen} 
                options={{ tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} /> }}
            />
            <Tab.Screen
                name="MyAppointments"
                component={MyAppointmentsScreen}
                options={{ 
                    title: "Appointments",
                    tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />
                }}
            />
            <Tab.Screen 
                name="Notifications" 
                component={NotificationsScreen} 
                options={{ tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }}
            />
            <Tab.Screen 
                name="Profile" 
                component={ProfileScreen} 
                options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
            />
        </Tab.Navigator>
    );
};

export default AppTabs;
