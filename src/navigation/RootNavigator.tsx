import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import AuthNavigator from "./AuthNavigator";
import AdminNavigator from "./AdminNavigator";
import PatientNavigator from "./PatientNavigator";
import StaffNavigator from "./StaffNavigator";
import { useAuthStore } from "../store/authStore";
import { useProfileStore } from "../store/profileStore";
import { getUserRoute } from "../utils/roleMapping";
import SplashScreen from "../features/auth/components/SplashScreen";

const RootNavigator = () => {
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
    if (loading === false && role === 'client' && !isPasswordRecovery) {
      return <PatientNavigator />;
    }

    // Navigate immediately if session and role/profile exists
    if (user && role && !isPasswordRecovery) {
      const targetRoute = getUserRoute(role);
      if (targetRoute === "AdminNavigator") {
        return <AdminNavigator />;
      }
      if (targetRoute === "StaffNavigator") {
        return <StaffNavigator />;
      }
      return <PatientNavigator />;
    }

    // Return a dark background placeholder while auth is loading or resolving roles initially
    if (isLoading) {
      return <View style={styles.placeholder} />;
    }

    if (!user || isPasswordRecovery) {
      return <AuthNavigator key={isPasswordRecovery ? "recovery" : "auth"} />;
    }

    if (!role) {
      return <View style={styles.placeholder} />;
    }

    const targetRoute = getUserRoute(role);

    if (targetRoute === "AdminNavigator") {
      return <AdminNavigator />;
    }

    if (targetRoute === "StaffNavigator") {
      return <StaffNavigator />;
    }

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
    backgroundColor: "#0F172A", // Dark blue placeholder matching the gradient splash theme
  },
});
