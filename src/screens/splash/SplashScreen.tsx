import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import Loader from "../../components/common/Loader";
import { colors, spacing, typography } from "../../theme";

const SplashScreen = () => {
    return (

        <ScreenWrapper>

            <View style={Styles.container} >
                <Text style={Styles.title} >
                    QueueLess
                </Text>
                <Text style={Styles.subTitle} >
                    Managing your queues efficiently
                </Text>

                <Loader

                />




            </View>
        </ScreenWrapper>
    )
}
export default SplashScreen
const Styles = StyleSheet.create({

    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: typography.h1,
        marginBottom: spacing.xl,
        color: colors.primary,
        fontWeight: 'bold',

    },
    subTitle: {
        fontSize: typography.body,
        color: colors.textSecondary,
        marginBottom: spacing.xl,

    }
})