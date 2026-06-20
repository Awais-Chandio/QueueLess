import React from "react";
import AuthNavigator from "./AuthNavigator";
import AdminNavigator from "./AdminNavigator";
import PatientNavigator from "./PatientNavigator";
import StaffNavigator from "./StaffNavigator";
import { useAuthStore } from "../store/authStore";
import { getUserRoute } from "../utils/roleMapping";
import SplashScreen from "../features/auth/components/SplashScreen";
const RootNavigator = () => {
  const { isLoading, role, user, isPasswordRecovery } = useAuthStore();

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!user || isPasswordRecovery) {
    return <AuthNavigator key={isPasswordRecovery ? "recovery" : "auth"} />;
  }

  if (!role) {
    return <SplashScreen />;
  }

  const route = getUserRoute(role);

  if (route === "AdminNavigator") {
    return <AdminNavigator />;
  }

  if (route === "StaffNavigator") {
    return <StaffNavigator />;
  }

  return <PatientNavigator />;
};

export default RootNavigator;
