import React from "react";
import { View,StyleSheet, Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {colors,radius,spacing} from "../../theme";

interface AppButtonProps {
  onPress: () => void;
  title: string;
  disabled?: boolean;
}

const AppButton =({onPress,title,disabled}: AppButtonProps)=>{
return(
    <Pressable style={Styles.button}
    onPress={onPress}
    disabled={disabled}
    >
        <Text style={Styles.buttonText} >{title}</Text>

    </Pressable>
)


}

export default AppButton;

const Styles = StyleSheet.create({  
button:{
    backgroundColor:colors.primary,
    padding:spacing.md,
    borderRadius: radius.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    width: '100%',
},
buttonText:{
    color: colors.background,
    fontWeight:'bold',
}
})