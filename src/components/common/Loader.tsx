import React from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { colors, spacing } from "../../theme";
type LoaderProps = {
    size?: 'small' | 'large';
    message?:string;

}
const Loader  = (props:LoaderProps)=>{
    return(

        <View style={Styles.container}>
            <ActivityIndicator
            size={props.size || "large"}
            color={colors.primary}
            />
            {props.message && <Text
            style={Styles.message}
            >{props.message}</Text>}
        </View>

)
}

export default Loader;

const Styles = StyleSheet.create({  
container:{
    flex:1,
    justifyContent:'center',
    alignItems:'center',
    padding:spacing.lg,
},
message:{
    marginTop:spacing.md,
    color:colors.textSecondary,
}
})