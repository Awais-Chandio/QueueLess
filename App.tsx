import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import RootNavigator from "./src/navigation/RootNavigator";
import { queryClient } from "./src/lib/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context"; 
import { useAuth } from "./src/hooks/useAuth";
import { useNotifications } from "./src/hooks/useNotifications";
import ToastMessage from "./src/components/ui/ToastMessage";
import { authService } from "./src/features/auth/api/authService";
import { useAuthStore } from "./src/store/authStore";
import { toastService } from "./src/services/toastService";
import { supabase, supabaseConfig } from "./src/lib/supabase";
import { hp, scaleFont, wp } from "./src/utils/responsive";

const persister = {
  persistClient: async (client: any) => {
    try {
      await AsyncStorage.setItem('REACT_QUERY_OFFLINE_CACHE', JSON.stringify(client));
    } catch (e) {
      console.warn('Failed to persist react-query cache:', e);
    }
  },
  restoreClient: async () => {
    try {
      const cache = await AsyncStorage.getItem('REACT_QUERY_OFFLINE_CACHE');
      return cache ? JSON.parse(cache) : undefined;
    } catch (e) {
      console.warn('Failed to restore react-query cache:', e);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await AsyncStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
    } catch (e) {
      console.warn('Failed to remove react-query cache:', e);
    }
  },
};

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
  useNotifications();
  const [realtimeConnected, setRealtimeConnected] = useState(true);

  useEffect(() => {
    if (!supabaseConfig.isValid) return;

    // Listen to real-time subscription status
    const channel = supabase.channel('realtime_status_listener');
    
    channel.subscribe((status) => {
      if (__DEV__) {
        console.log('[REALTIME_STATUS]', status);
      }
      if (status === 'SUBSCRIBED') {
        setRealtimeConnected(true);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setRealtimeConnected(false);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfig.isValid) {
      useAuthStore.getState().clearAuth();
      return;
    }

    const handleIncomingDeepLink = async (url: string | null) => {
      if (!url) return false;

      if (__DEV__) {
        console.log('[DEEP_LINK] Handling incoming link:', url);
      }

      if (url.startsWith("queueless://reset-password")) {
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
      }

      if (url.startsWith("queueless://auth/callback")) {
        if (useAuthStore.getState().session) {
          if (__DEV__) {
            console.log('[DEEP_LINK] Session already exists, ignoring duplicate callback');
          }
          return true;
        }

        try {
          useAuthStore.getState().setLoading(true);
          const urlToParse = url.includes('#') ? url.replace('#', '?') : url;
          const parsedUrl = new URL(urlToParse);
          
          const code = parsedUrl.searchParams.get('code');
          const accessToken = parsedUrl.searchParams.get('access_token');
          const refreshToken = parsedUrl.searchParams.get('refresh_token');

          if (code) {
            const { error } = await authService.exchangeCodeForSession(code);
            if (error) throw error;
          } else if (accessToken && refreshToken) {
            const { error } = await authService.setRecoverySession(accessToken, refreshToken);
            if (error) throw error;
          }

          await restoreSession();
          return true;
        } catch (error) {
          const sessionResult = await authService.getSession();
          if (sessionResult.data.session) {
            await restoreSession();
            return true;
          }
          const message = error instanceof Error ? error.message : "Google login redirection failed";
          toastService.error(message);
          return true;
        } finally {
          const hasSession = !!useAuthStore.getState().session;
          if (!hasSession) {
            useAuthStore.getState().setLoading(false);
          }
        }
      }

      return false;
    };

    Linking.getInitialURL().then(async url => {
      const handled = await handleIncomingDeepLink(url);

      if (!handled) {
        restoreSession();
      }
    });

    const subscription = Linking.addEventListener("url", event => {
      handleIncomingDeepLink(event.url);
    });

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (__DEV__) {
          console.log(`[AUTH_EVENT] Event: ${event}, Session Exists: ${!!session}`);
        }
        if (event === 'SIGNED_IN' && session) {
          const currentStoreSession = useAuthStore.getState().session;
          const currentRole = useAuthStore.getState().role;
          const isCurrentlyLoading = useAuthStore.getState().isLoading;
          if ((!currentStoreSession || !currentRole) && !isCurrentlyLoading) {
            setTimeout(async () => {
              await restoreSession();
            }, 0);
          }
        } else if (event === 'SIGNED_OUT') {
          useAuthStore.getState().clearAuth();
        }
      }
    );

    return () => {
      subscription.remove();
      authSubscription.unsubscribe();
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <SafeAreaProvider>
        <View style={styles.container}>
          <NavigationContainer linking={linking}>
            <RootNavigator/>
          </NavigationContainer>
          
          <View style={[
            styles.connectionDot,
            { backgroundColor: realtimeConnected ? '#22C55E' : '#EF4444' }
          ]} />

          <ToastMessage />
        </View>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
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
  connectionDot: {
    position: 'absolute',
    top: 54,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 9999,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
});
