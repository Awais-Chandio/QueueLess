import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./src/navigation/RootNavigator";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from './src/services/supabase/client';  


const App = ()=>{
  useEffect(() => {
    const checkSession = async () => {
    const result  = await supabase.auth.getSession();

      console.log('Current session:', result.data.session);
    };
    checkSession();
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