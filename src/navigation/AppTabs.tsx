import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/home/HomeScreen";
import SettingsScreen from "../screens/settings/SettingsScreen";
import CentersScreen from "../screens/centers/CentersScreen";
import MyAppointmentsScreen from "../screens/appointments/MyAppointmentsScreen";
import ProfileScreen from "../screens/profile/ProfileScreen";
import type { AppTabParamList } from "./types";

const Tab = createBottomTabNavigator<AppTabParamList>();

const AppTabs = () => {
    return (

        <Tab.Navigator
            screenOptions={{ headerShown: false }}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Centers" component={CentersScreen} />
            <Tab.Screen
                name="MyAppointments"
                component={MyAppointmentsScreen}
                options={{ title: "My Appointments" }}
            />
            <Tab.Screen name="Profile" component={ProfileScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />


        </Tab.Navigator>
    )
}

export default AppTabs;
