import React from "react";
import {View,Text,StyleSheet} from "react-native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import Loader from "../../components/common/Loader";

const SplashScreen=()=>{
    return(

        <ScreenWrapper>

            <View style={Styles.container} >
                <Loader>

                    
                </Loader>

            </View>
        </ScreenWrapper>
    )
}
export default SplashScreen
const Styles = StyleSheet.create({

})