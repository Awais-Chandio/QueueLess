import { useEffect } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import RootNavigator from "./src/navigation/RootNavigator";
import { queryClient } from "./src/lib/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context"; 
import { useAuth } from "./src/hooks/useAuth";
import ToastMessage from "./src/components/ui/ToastMessage";
import { authService } from "./src/features/auth/api/authService";
import { useAuthStore } from "./src/store/authStore";
import { toastService } from "./src/services/toastService";
import { supabaseConfig } from "./src/lib/supabase";
import { hp, scaleFont, wp } from "./src/utils/responsive";

const linking = {
  prefixes: ["queueless://"],
  config: {
    screens: {
      ResetPassword: "reset-password",
    },
  },
};

const getDeepLinkParams = (url: string) => {
  const params = new URLSearchParams();
  const [, queryString = ""] = url.split("?");
  const [queryWithoutHash = ""] = queryString.split("#");
  const [, fragmentString = ""] = url.split("#");

  [queryWithoutHash, fragmentString].forEach(part => {
    if (!part) return;
    new URLSearchParams(part).forEach((value, key) => {
      params.set(key, value);
    });
  });

  return params;
};

const App = ()=>{
  const { restoreSession } = useAuth();

  useEffect(() => {
    if (!supabaseConfig.isValid) {
      useAuthStore.getState().clearAuth();
      return;
    }

    const handlePasswordRecoveryLink = async (url: string | null) => {
      if (!url || !url.startsWith("queueless://reset-password")) {
        return false;
      }

      const params = getDeepLinkParams(url);
      const errorDescription = params.get("error_description");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const code = params.get("code");

      if (errorDescription) {
        toastService.error(decodeURIComponent(errorDescription));
        return true;
      }

      try {
        useAuthStore.getState().setPasswordRecovery(true);

        if (accessToken && refreshToken) {
          const { data, error } = await authService.setRecoverySession(
            accessToken,
            refreshToken,
          );

          if (error) {
            throw error;
          }

          useAuthStore.getState().setSession(data.session);
          return true;
        }

        if (code) {
          const { data, error } = await authService.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          useAuthStore.getState().setSession(data.session);
        }

        return true;
      } catch (error) {
        useAuthStore.getState().setPasswordRecovery(false);
        const message =
          error instanceof Error
            ? error.message
            : "Password reset link is invalid or expired";
        toastService.error(message);
        return true;
      }
    };

    Linking.getInitialURL().then(async url => {
      const handled = await handlePasswordRecoveryLink(url);

      if (!handled) {
        restoreSession();
      }
    });

    const subscription = Linking.addEventListener("url", event => {
      handlePasswordRecoveryLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [restoreSession]);

  if (!supabaseConfig.isValid) {
    return (
      <SafeAreaProvider>
        <View style={styles.startupErrorContainer}>
          <Text style={styles.startupErrorTitle}>Configuration error</Text>
          <Text style={styles.startupErrorMessage}>
            {supabaseConfig.errorMessage}
          </Text>
          <Text style={styles.startupErrorHint}>
            Please rebuild the app with Supabase URL and anon key configured.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <View style={styles.container}>
          <NavigationContainer linking={linking}>
            <RootNavigator/>
          </NavigationContainer>
          <ToastMessage />
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  startupErrorContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: wp(6),
    backgroundColor: "#FFFFFF",
  },
  startupErrorTitle: {
    marginBottom: hp(1.5),
    color: "#B42318",
    fontSize: scaleFont(24),
    fontWeight: "700",
    textAlign: "center",
  },
  startupErrorMessage: {
    color: "#111827",
    fontSize: scaleFont(16),
    lineHeight: scaleFont(22),
    textAlign: "center",
  },
  startupErrorHint: {
    marginTop: hp(1.5),
    color: "#4B5563",
    fontSize: scaleFont(14),
    lineHeight: scaleFont(20),
    textAlign: "center",
  },
});
