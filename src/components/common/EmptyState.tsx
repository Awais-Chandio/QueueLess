import React from "react";
import { View, StyleSheet, Text, } from "react-native";
import { colors, spacing, typography } from "../../theme";
import AppButton from "./AppButton";
type EmptyStateProps = {
    title?: string;
    subtitle?: string;
    buttonTitle?: string;
    onButtonPress?: () => void;
}
const EmptyState = (props: EmptyStateProps) => {
    return (
        <View style={Styles.container}>
            <Text
                style={Styles.title}>
                {props.title || "No Data"}
            </Text>
            {props.subtitle && <Text
                style={Styles.subtitle}
            >{props.subtitle}</Text>}

            {props.buttonTitle && props.onButtonPress && (
                <View style={Styles.button}>
                    <AppButton
                        title={props.buttonTitle}
                        onPress={props.onButtonPress}
                    />
                </View>
            )}


        </View>
    )
}
export default EmptyState;
const Styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg
    },
    title: {
        color: colors.text,
        fontWeight: '600', fontSize: typography.h3,
    },
    subtitle: {
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg

    },
    button: {
        marginTop: spacing.lg,
        width: '100%'
    }





})