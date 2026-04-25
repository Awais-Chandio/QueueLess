import React from "react";
import { StyleSheet, Pressable, Text } from "react-native";
import { colors, radius, spacing } from "../../theme";

interface AppButtonProps {
    onPress: () => void;
    title: string;
    loading?: boolean;
    disabled?: boolean;
}

const AppButton = ({ onPress, title, loading, disabled }: AppButtonProps) => {
    return (
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
    button: {
        backgroundColor: colors.primary,
        padding: spacing.md,
        borderRadius: radius.borderRadius,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.sm,
        width: '100%',
    },
    buttonText: {
        color: colors.background,
        fontWeight: 'bold',
    }
})