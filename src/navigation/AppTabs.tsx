import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/home/HomeScreen";
import SettingsScreen from "../screens/settings/SettingsScreen";
import CentersScreen from "../screens/centers/CentersScreen";
import MyBookingsScreen from "../screens/bookings/MyBookingsScreen";
import ProfileScreen from "../screens/profile/ProfileScreen";

const Tab = createBottomTabNavigator();

const AppTabs = () => {
    return (

        <Tab.Navigator
            screenOptions={{ headerShown: false }}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Centers" component={CentersScreen} />
            <Tab.Screen name="My Bookings" component={MyBookingsScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />


        </Tab.Navigator>
    )
}

export default AppTabs;