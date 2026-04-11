import React from "react";
import { View, StyleSheet, TextInput, Text } from "react-native";
import { colors, radius, spacing } from "../../theme/index"

type AppInputProps = {
    placeholder?: string;
    value: string;
    onChangeText: (text: string) => void;
    secureTextEntry?: boolean;
    label?: string;
    error?: string;
}

const AppInput = (props: AppInputProps) => {
    return (
        <View style={Styles.container}>
            {props.label && <Text style={Styles.label}>{props.label}</Text>}
            <TextInput
                placeholder={props.placeholder}
                value={props.value}
                onChangeText={props.onChangeText}
                secureTextEntry={props.secureTextEntry}
                style={Styles.input}
                placeholderTextColor={colors.textSecondary}


            />

            

        </View>

    )

}

export default AppInput;

const Styles = StyleSheet.create({
    container: {
        width: '100%',
  marginBottom: spacing.md,
    },
    label: {
        marginBottom: spacing.sm,
        color: colors.text,
        fontWeight: '600',
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        borderRadius: radius.borderRadius,
        color:colors.text,
        backgroundColor:colors.surface,
    }
})
