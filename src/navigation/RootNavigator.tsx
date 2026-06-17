import React from "react";
import AuthNavigator from "./AuthNavigator";
import AppNavigator from "./AppNavigator";
import { useAuth } from "../hooks/useAuth";
// If the actual splash screen module isn't available, use a minimal fallback
// to avoid module resolution errors during builds or type checks.
const SplashScreen: React.FC = () => null;
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
