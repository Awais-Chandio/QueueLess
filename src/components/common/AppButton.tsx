import React from "react";
import { ActivityIndicator, StyleSheet, Pressable, Text } from "react-native";
import { colors, radius, spacing } from "../../theme";

interface AppButtonProps {
    onPress: () => void;
    title: string;
    loading?: boolean;
    disabled?: boolean;
}

const AppButton = ({ onPress, title, loading = false, disabled = false }: AppButtonProps) => {
    const isDisabled = disabled || loading;

    return (
        <Pressable
            style={({ pressed }) => [
                styles.button,
                pressed && !isDisabled && styles.pressedButton,
                isDisabled && styles.disabledButton,
            ]}
            onPress={onPress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityState={{
                busy: loading,
                disabled: isDisabled,
            }}
        >
            {loading ? (
                <ActivityIndicator color={colors.background} />
            ) : (
                <Text style={styles.buttonText}>{title}</Text>
            )}
        </Pressable>
    );
};

export default AppButton;

const styles = StyleSheet.create({
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
    },
    pressedButton: {
        opacity: 0.85,
    },
    disabledButton: {
        opacity: 0.5,
    },
});
