import React, { useState } from "react";
import { View, StyleSheet, TextInput, Text, Pressable } from "react-native";
import type { TextInputProps } from "react-native";
import { useTheme } from "../../hooks/useTheme";
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
    const { colors, radius, spacing, typography } = useTheme();
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const isPasswordField = props.secureTextEntry !== undefined && props.secureTextEntry === true;
    const shouldHideText = isPasswordField && !isPasswordVisible;
    const LeftIconComponent = props.leftIcon;

    const inputBorderColor = props.error ? colors.error : isFocused ? colors.primary : colors.border;

    return (
        <View style={[styles.container, { marginBottom: spacing.md }]}>
            {props.label && (
                <Text style={[styles.label, { color: props.error ? colors.error : colors.text, marginBottom: spacing.xs, fontSize: typography.small }]}>
                    {props.label}
                </Text>
            )}
            <View
                style={[
                    styles.inputWrapper,
                    {
                        backgroundColor: colors.card,
                        borderRadius: radius.lg,
                        borderColor: inputBorderColor,
                        borderWidth: isFocused ? 1.5 : 1,
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: isFocused ? 0.12 : 0.04,
                        shadowRadius: isFocused ? 18 : 10,
                        elevation: isFocused ? 4 : 1,
                    },
                ]}
            >
                {LeftIconComponent && (
                    <View style={styles.leftIconContainer}>
                        <LeftIconComponent
                            size={scaleFont(18)}
                            color={isFocused ? colors.primary : colors.textSecondary}
                        />
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
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    style={[
                        styles.input, 
                        { color: colors.text, fontSize: typography.body, minHeight: hp(5.6), padding: spacing.md },
                        isPasswordField && { paddingRight: wp(12) },
                        LeftIconComponent && { paddingLeft: scaleFont(42) }
                    ]}
                    placeholderTextColor={colors.textTertiary}
                />
                {isPasswordField && (
                    <Pressable
                        style={[styles.eyeIconContainer, { right: spacing.md }]}
                        onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        {isPasswordVisible ? (
                            <EyeOff size={scaleFont(18)} color={colors.textSecondary} />
                        ) : (
                            <Eye size={scaleFont(18)} color={colors.textSecondary} />
                        )}
                    </Pressable>
                )}
            </View>
            {props.error && <Text style={[styles.errorText, { color: colors.error, fontSize: typography.caption, marginTop: spacing.xs, marginLeft: spacing.xs }]}>{props.error}</Text>}
        </View>
    );
};

export default AppInput;

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    label: {
        fontWeight: '600',
        letterSpacing: 0,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    input: {
        flex: 1,
    },
    eyeIconContainer: {
        position: 'absolute',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    leftIconContainer: {
        position: 'absolute',
        left: 14,
        zIndex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontWeight: '500',
        letterSpacing: 0,
    }
});
