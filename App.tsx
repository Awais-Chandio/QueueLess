import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./src/navigation/RootNavigator";
import { SafeAreaProvider } from "react-native-safe-area-context"; 
import { useAuth } from "./src/hooks/useAuth";


const App = ()=>{
  const { restoreSession } = useAuth();
  useEffect(() => {
    restoreSession();
  }, []);
  return(
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator/>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default App;