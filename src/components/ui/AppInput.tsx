import React, { useState } from "react";
import { View, StyleSheet, TextInput, Text, Pressable } from "react-native";
import type { TextInputProps } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/index";
import { Eye, EyeOff, LucideIcon } from "lucide-react-native";
import { hp, scaleFont, wp } from "../../utils/responsive";

type AppInputProps = {
    placeholder?: string;
    value: string;
    onChangeText: (text: string) => void;
    secureTextEntry?: boolean;
    label?: string;
    error?: string;
    keyboardType?: TextInputProps["keyboardType"];
    autoCapitalize?: TextInputProps["autoCapitalize"];
    autoCorrect?: TextInputProps["autoCorrect"];
    textContentType?: TextInputProps["textContentType"];
    autoComplete?: TextInputProps["autoComplete"];
    editable?: TextInputProps["editable"];
    leftIcon?: LucideIcon;
}

const AppInput = (props: AppInputProps) => {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const isPasswordField = props.secureTextEntry !== undefined && props.secureTextEntry === true;
    const shouldHideText = isPasswordField && !isPasswordVisible;
    const LeftIconComponent = props.leftIcon;

    return (
        <View style={Styles.container}>
            {props.label && <Text style={Styles.label}>{props.label}</Text>}
            <View style={Styles.inputContainer}>
                {LeftIconComponent && (
                    <View style={Styles.leftIconContainer}>
                        <LeftIconComponent size={scaleFont(18)} color={colors.textSecondary} />
                    </View>
                )}
                <TextInput
                    placeholder={props.placeholder}
                    value={props.value}
                    onChangeText={props.onChangeText}
                    secureTextEntry={shouldHideText}
                    keyboardType={props.keyboardType}
                    autoCapitalize={props.autoCapitalize}
                    autoCorrect={props.autoCorrect}
                    textContentType={props.textContentType}
                    autoComplete={props.autoComplete}
                    editable={props.editable}
                    style={[
                        Styles.input, 
                        isPasswordField && { paddingRight: wp(12) },
                        LeftIconComponent && { paddingLeft: scaleFont(44) }
                    ]}
                    placeholderTextColor={colors.textSecondary}
                />
                {isPasswordField && (
                    <Pressable
                        style={Styles.eyeIconContainer}
                        onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        {isPasswordVisible ? (
                            <EyeOff size={scaleFont(20)} color={colors.textSecondary} />
                        ) : (
                            <Eye size={scaleFont(20)} color={colors.textSecondary} />
                        )}
                    </Pressable>
                )}
            </View>
            {props.error && <Text style={Styles.errorText}>{props.error}</Text>}
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
        fontSize: typography.small,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        borderRadius: radius.borderRadius,
        color: colors.text,
        backgroundColor: colors.surface,
        fontSize: typography.body,
        minHeight: hp(5.6),
    },
    eyeIconContainer: {
        position: 'absolute',
        right: spacing.md,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    leftIconContainer: {
        position: 'absolute',
        left: spacing.md,
        zIndex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        color: colors.error,
        fontSize: typography.caption,
        marginTop: spacing.xs,
    }
});
