import React from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import MedicalLogo from "./MedicalLogo";
import { scaleFont } from "../../utils/responsive";
type LoaderProps = {
    size?: 'small' | 'large';
    message?: string;

}
const Loader = (props: LoaderProps) => {
    const { colors, spacing, typography } = useTheme();

    return (

        <View style={[Styles.container, { padding: spacing.lg }]}>
            <View style={[Styles.logoWrap, { marginBottom: spacing.md }]}>
                <MedicalLogo size={scaleFont(58)} showBackground />
            </View>
            <ActivityIndicator
                size={props.size || "large"}
                color={colors.primary}
            />
            {props.message && <Text
                style={[Styles.message, { marginTop: spacing.md, color: colors.textSecondary, fontSize: typography.sizes.sm }]}
            >{props.message}</Text>}
        </View>

    )
}

export default Loader;

const Styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoWrap: {
        shadowColor: '#0F766E',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
        elevation: 6,
    },
    message: {
        textAlign: 'center',
        fontWeight: '600',
    }
})
