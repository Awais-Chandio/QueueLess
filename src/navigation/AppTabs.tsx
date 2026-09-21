import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useQueryClient } from "@tanstack/react-query";
import HomeScreen from "../screens/patient/HomeScreen";
import MyAppointmentsScreen from "../features/appointments/components/MyAppointmentsScreen";
import ProfileScreen from "../features/profile/components/ProfileScreen";
import CentersScreen from "../features/centers/components/CentersScreen";
import MapScreen from "../screens/map/MapScreen";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useNotificationsStore } from "../store/notificationsStore";
import type { Notification } from "../types/notification";
import type { AppTabParamList } from "./types";
import { useTheme } from "../hooks/useTheme";
import { Home, Compass, MapPinned, Calendar, User } from "lucide-react-native";
import { hp } from "../utils/responsive";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator<AppTabParamList>();
let notificationChannelInstance = 0;

type TabIconProps = {
    color: string;
    size: number;
    focused?: boolean;
};

const AnimatedTabIcon = ({ Icon, color, size, focused }: { Icon: any; color: string; size: number; focused?: boolean }) => {
    const scale = useSharedValue(1);
    const activeProgress = useSharedValue(focused ? 1 : 0);

    useEffect(() => {
        scale.value = withSpring(focused ? 1.15 : 1, {
            damping: 15,
            stiffness: 180,
        });
        activeProgress.value = withSpring(focused ? 1 : 0, {
            damping: 15,
            stiffness: 180,
        });
    }, [focused, activeProgress, scale]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const bgStyle = useAnimatedStyle(() => ({
        opacity: activeProgress.value,
        transform: [{ scale: activeProgress.value }],
    }));

    return (
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 32, width: 56 }}>
            <Animated.View style={[
                {
                    position: 'absolute',
                    width: 48,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: color + '12',
                },
                bgStyle
            ]} />
            <Animated.View style={animStyle}>
                <Icon color={color} size={size} fill={focused ? color : 'transparent'} />
            </Animated.View>
        </View>
    );
};

const HomeTabIcon = ({ color, size, focused }: TabIconProps) => (
    <AnimatedTabIcon Icon={Home} color={color} size={size} focused={focused} />
);

const ExploreTabIcon = ({ color, size, focused }: TabIconProps) => (
    <AnimatedTabIcon Icon={Compass} color={color} size={size} focused={focused} />
);

const MapTabIcon = ({ color, size, focused }: TabIconProps) => (
    <AnimatedTabIcon Icon={MapPinned} color={color} size={size} focused={focused} />
);

const AppointmentsTabIcon = ({ color, size, focused }: TabIconProps) => (
    <AnimatedTabIcon Icon={Calendar} color={color} size={size} focused={focused} />
);

const ProfileTabIcon = ({ color, size, focused }: TabIconProps) => (
    <AnimatedTabIcon Icon={User} color={color} size={size} focused={focused} />
);

const sortNotifications = (notifications: Notification[]) =>
    [...notifications].sort(
        (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
    );

const upsertNotificationIntoList = (
    notifications: Notification[],
    notification: Notification,
) =>
    sortNotifications([
        notification,
        ...notifications.filter(item => item.id !== notification.id),
    ]);

const getRealtimeNotification = (value: unknown): Notification | null => {
    if (!value || typeof value !== "object") {
        return null;
    }

    const row = value as Partial<Notification>;
    if (
        typeof row.id !== "string" ||
        typeof row.user_id !== "string" ||
        typeof row.title !== "string" ||
        typeof row.message !== "string" ||
        typeof row.is_read !== "boolean" ||
        typeof row.created_at !== "string"
    ) {
        return null;
    }

    return {
        id: row.id,
        user_id: row.user_id,
        title: row.title,
        message: row.message,
        is_read: row.is_read,
        created_at: row.created_at,
        appointment_id: row.appointment_id ?? null,
        type: typeof row.type === 'string' ? row.type : 'general',
        data: row.data ?? {},
    };
};

const getRealtimeNotificationId = (value: unknown) => {
    if (!value || typeof value !== "object") {
        return null;
    }

    const row = value as Partial<Notification>;
    return typeof row.id === "string" ? row.id : null;
};

const AppTabs = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const userId = useAuthStore(state => state.user?.id);
    const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);
    const upsertStoreNotification = useNotificationsStore(state => state.upsertNotification);
    const removeStoreNotification = useNotificationsStore(state => state.removeNotification);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (userId) {
            fetchNotifications(userId);
        }
    }, [fetchNotifications, userId]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const channel = supabase
            .channel(
                `tab-notifications-${userId}-${++notificationChannelInstance}`,
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                payload => {
                    console.log('NEW NOTIFICATION:', payload.new);

                    if (payload.eventType === 'DELETE') {
                        const notificationId = getRealtimeNotificationId(payload.old);
                        if (!notificationId) {
                            return;
                        }

                        removeStoreNotification(notificationId);
                        queryClient.setQueryData<Notification[]>(
                            ['notifications', userId],
                            current =>
                                (current ?? []).filter(
                                    notification => notification.id !== notificationId,
                                ),
                        );
                        return;
                    }

                    const notification = getRealtimeNotification(payload.new);
                    if (!notification) {
                        console.warn('[APP_TABS] Invalid notification payload:', payload);
                        return;
                    }

                    upsertStoreNotification(notification);
                    queryClient.setQueryData<Notification[]>(
                        ['notifications', userId],
                        current => upsertNotificationIntoList(current ?? [], notification),
                    );
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [
        queryClient,
        removeStoreNotification,
        upsertStoreNotification,
        userId,
    ]);

    return (
        <Tab.Navigator
            screenOptions={{ 
                headerShown: false,
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarStyle: {
                    position: 'absolute',
                    bottom: insets.bottom > 0 ? (Platform.OS === 'ios' ? insets.bottom : insets.bottom + 8) : spacing.md,
                    left: spacing.md,
                    right: spacing.md,
                    backgroundColor: colors.surface,
                    borderRadius: 24,
                    height: hp(7.8),
                    borderTopWidth: 0,
                    borderWidth: 1,
                    borderColor: colors.border + '40',
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                    elevation: 8,
                    paddingBottom: insets.bottom > 0 ? (Platform.OS === 'ios' ? spacing.xs : 2) : (Platform.OS === 'ios' ? spacing.xs : spacing.sm),
                    paddingTop: spacing.xs,
                },
                tabBarLabelStyle: {
                    fontSize: typography.sizes.xs - 1,
                    fontWeight: '600',
                    marginBottom: Platform.OS === 'ios' ? 0 : 2,
                },
                tabBarItemStyle: {
                    paddingVertical: spacing.xs,
                },
                tabBarHideOnKeyboard: true,
            }}>
            <Tab.Screen 
                name="Home" 
                component={HomeScreen} 
                options={{ tabBarIcon: HomeTabIcon }}
            />
            <Tab.Screen
                name="Explore"
                component={CentersScreen}
                options={{ tabBarIcon: ExploreTabIcon }}
            />
            <Tab.Screen
                name="Map"
                component={MapScreen}
                options={{ tabBarIcon: MapTabIcon }}
            />
            <Tab.Screen
                name="MyAppointments"
                component={MyAppointmentsScreen}
                options={{ 
                    title: "Appointments",
                    tabBarIcon: AppointmentsTabIcon,
                }}
            />
            <Tab.Screen 
                name="Profile" 
                component={ProfileScreen} 
                options={{ tabBarIcon: ProfileTabIcon }}
            />
        </Tab.Navigator>
    );
};

export default AppTabs;
