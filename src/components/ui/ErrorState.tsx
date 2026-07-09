import React from "react";
import { View, StyleSheet, Text, } from "react-native";
import AppButton from "./AppButton";
import { useTheme } from "../../hooks/useTheme";
import BrandIllustration from "./BrandIllustration";
import { scaleFont } from "../../utils/responsive";
type ErrorStateProps = {
    title?: string
    message?: string
    buttonTitle?: string
    onRetry?: () => void
}
const ErrorState = (props: ErrorStateProps) => {
    const { colors, spacing, typography } = useTheme();

    return (
        <View style={[Styles.container, { paddingHorizontal: spacing.lg }]}>
            <BrandIllustration kind="error" size={scaleFont(150)} />
            <Text
                style={[Styles.title, { color: colors.text, fontSize: typography.sizes.xl, marginTop: spacing.md, marginBottom: spacing.xs }]}>
                {props.title || "Something went wrong"}
            </Text>
            {props.message && <Text
                style={[Styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.md, marginBottom: spacing.lg }]}
            >{props.message}</Text>}

            {props.buttonTitle && props.onRetry && (
                <View style={[Styles.button, { marginTop: spacing.sm }]}>
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
    },
    title: {
        fontWeight: "800",
        textAlign: "center",
    },
    subtitle: {
        textAlign: "center",
        lineHeight: scaleFont(23),
    },
    button: {
        width: "100%",
        maxWidth: 300,
    },
});
