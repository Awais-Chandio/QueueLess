import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import RootNavigator from "./src/navigation/RootNavigator";
import { queryClient } from "./src/lib/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context"; 
import { useAuth } from "./src/hooks/useAuth";
import ToastMessage from "./src/components/ui/ToastMessage";

const App = ()=>{
  const { restoreSession } = useAuth();
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);
  return(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <View style={styles.container}>
          <NavigationContainer>
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
});
