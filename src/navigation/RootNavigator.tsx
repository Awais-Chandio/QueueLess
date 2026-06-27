import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import AuthNavigator from "./AuthNavigator";
import AdminNavigator from "./AdminNavigator";
import PatientNavigator from "./PatientNavigator";
import StaffNavigator from "./StaffNavigator";
import { useAuthStore } from "../store/authStore";
import { getUserRoute } from "../utils/roleMapping";
import SplashScreen from "../features/auth/components/SplashScreen";

const RootNavigator = () => {
  const { isLoading, role, user, isPasswordRecovery } = useAuthStore();
  const [isSplashFinished, setIsSplashFinished] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // We are fully ready when auth is not loading AND if logged in, the role is resolved
  const isReady = !isLoading && (user ? role !== null : true);

  // Show transition overlay loader when auth state changes after initial boot
  React.useEffect(() => {
    if (!isReady && isSplashFinished) {
      setShowOverlay(true);
    }
  }, [isReady, isSplashFinished]);

  const renderContent = () => {
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

    const route = getUserRoute(role);

    if (route === "AdminNavigator") {
      return <AdminNavigator />;
    }

    if (route === "StaffNavigator") {
      return <StaffNavigator />;
    }

    return <PatientNavigator />;
  };

  return (
    <View style={styles.container}>
      {renderContent()}
      
      {/* Initial Startup Splash */}
      {!isSplashFinished && (
        <SplashScreen
          isReady={isReady}
          onAnimationComplete={() => setIsSplashFinished(true)}
        />
      )}

      {/* Transition Loader Overlay (Sign-in / Sign-out) */}
      {isSplashFinished && showOverlay && (
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
