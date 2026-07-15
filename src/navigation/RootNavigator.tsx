import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import AuthNavigator from "./AuthNavigator";
import AdminNavigator from "./AdminNavigator";
import PatientNavigator from "./PatientNavigator";
import DoctorNavigator from "./DoctorNavigator";
import CounterStaffNavigator from "./CounterStaffNavigator";
import { useAuthStore } from "../store/authStore";
import { useProfileStore } from "../store/profileStore";
import { getUserRoute } from "../utils/roleMapping";
import SplashScreen from "../features/auth/components/SplashScreen";
import { useNotifications } from "../hooks/useNotifications";
import { useTheme } from "../hooks/useTheme";

const RootNavigator = () => {
  useNotifications();
  const { isDarkMode } = useTheme();
  const { isLoading, role, user, isPasswordRecovery } = useAuthStore();
  const { profile } = useProfileStore();
  const [isSplashFinished, setIsSplashFinished] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // We are fully ready when auth is not loading AND if logged in, the role is resolved, OR immediately ready if user and role are present
  const isReady = (user && role) ? true : (!isLoading && (user ? role !== null : true));

  const loading = isLoading;
  const route = role ? getUserRoute(role) : null;

  // Debug logging
  React.useEffect(() => {
    console.log('AUTH_LOADING:', loading);
    console.log('PROFILE:', profile);
    console.log('ROLE:', role);
    console.log('CURRENT_ROUTE:', route);
  }, [loading, profile, role, route]);

  // Handle splash transition & dismiss instantly on successful auth
  React.useEffect(() => {
    if (user && role) {
      setIsSplashFinished(true);
      setShowOverlay(false);
    } else if (!isReady && isSplashFinished) {
      setShowOverlay(true);
    }
  }, [isReady, isSplashFinished, user, role]);

  const renderContent = () => {
    // Return a dark background placeholder while auth is loading initially during boot
    if (isLoading && !isSplashFinished) {
      return <View style={[styles.placeholder, { backgroundColor: isDarkMode ? '#031C24' : '#083344' }]} />;
    }

    if (!user || isPasswordRecovery) {
      return <AuthNavigator key={isPasswordRecovery ? "recovery" : "auth"} />;
    }

    if (!role) {
      return <View style={[styles.placeholder, { backgroundColor: isDarkMode ? '#031C24' : '#083344' }]} />;
    }

    if (role === 'admin') return <AdminNavigator />;
    if (role === 'doctor') return <DoctorNavigator />;
    if (role === 'staff') return <CounterStaffNavigator />;
    if (role === 'client') return <PatientNavigator />;

    return <PatientNavigator />;
  };

  const showSplash = !isSplashFinished && !(user && role);
  const showOverlayLoader = isSplashFinished && showOverlay && !(user && role);

  return (
    <View style={styles.container}>
      {renderContent()}
      
      {/* Initial Startup Splash */}
      {showSplash && (
        <SplashScreen
          isReady={isReady}
          onAnimationComplete={() => setIsSplashFinished(true)}
        />
      )}

      {/* Transition Loader Overlay (Sign-in / Sign-out) */}
      {showOverlayLoader && (
        <SplashScreen
          isReady={isReady}
          isGentlyLoading={true}
          message={isLoading ? "Loading..." : "Setting up your workspace..."}
          onAnimationComplete={() => setShowOverlay(false)}
        />
      )}
    </View>
  );
};

export default RootNavigator;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    backgroundColor: "#061A1A", // Dark clinical placeholder matching the gradient splash theme
  },
});
