import React from "react";
import { View, StyleSheet, Text, } from "react-native";
import { colors, spacing, typography } from "../../theme";
import AppButton from "./AppButton";
type ErrorStateProps = {
    title?: string
    message?: string
    buttonTitle?: string
    onRetry?: () => void
}
const ErrorState = (props: ErrorStateProps) => {
    return (
        <View style={Styles.container}>
            <Text
                style={Styles.title}>
                {props.message || "Something went wrong"}
            </Text>
            {props.message && <Text
                style={Styles.subtitle}
            >{props.message}</Text>}

            {props.buttonTitle && props.onRetry && (
                <View style={Styles.button}>
                    <AppButton
                        title={props.buttonTitle}
                        onPress={props.onRetry}
                    />
                </View>

            )}
        </View>
    );
};

export default ErrorState;

const Styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.md,
    },
    title: {
        fontSize: typography.h1,
        fontWeight: "bold",
        color: colors.error,
        marginBottom: spacing.sm,
    },
    subtitle: {
        fontSize: typography.body,
        color: colors.text,
        marginBottom: spacing.md,
    },
    button: {
        marginTop: spacing.md,
        width: "100%",
    },
});

