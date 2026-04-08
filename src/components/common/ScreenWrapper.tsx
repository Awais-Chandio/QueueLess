import React from "react";
import { View,StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {colors,spacing} from "../../theme";

const ScreenWrapper = ()=>{

<SafeAreaView style={Styles.SafeArea}>
<View style = {Styles.container}>


</View>
    
</SafeAreaView>


}
export default  ScreenWrapper;

const Styles = StyleSheet.create({
SafeArea:{
    flex:1,
    backgroundColor:colors.background,
},
container:{
flex:1,
padding:spacing.lg
}

})