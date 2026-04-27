import React from "react";
import AuthNavigator from "./AuthNavigator";
import AppNavigator from "./AppNavigator";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "../screens/splash/SplashScreen";
const RootNavigator = () => {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  return <AppNavigator />;
};

export default RootNavigator;
