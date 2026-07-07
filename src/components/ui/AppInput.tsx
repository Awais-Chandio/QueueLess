import React, { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, Text, Pressable } from "react-native";
import type { TextInputProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolateColor,
} from "react-native-reanimated";
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
    const [isFocused, setIsFocused] = useState(false);

    const isPasswordField = props.secureTextEntry !== undefined && props.secureTextEntry === true;
    const shouldHideText = isPasswordField && !isPasswordVisible;
    const LeftIconComponent = props.leftIcon;

    // Shared values for animations
    const focusAnim = useSharedValue(0);
    const shakeAnim = useSharedValue(0);

    // Focus animation
    useEffect(() => {
        focusAnim.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
    }, [isFocused, focusAnim]);

    // Error shake animation
    useEffect(() => {
        if (props.error) {
            shakeAnim.value = withSequence(
                withTiming(-8, { duration: 60 }),
                withTiming(8, { duration: 60 }),
                withTiming(-6, { duration: 60 }),
                withTiming(6, { duration: 60 }),
                withTiming(0, { duration: 60 })
            );
        }
    }, [props.error, shakeAnim]);

    const animatedInputContainerStyle = useAnimatedStyle(() => {
        const borderColor = interpolateColor(
            focusAnim.value,
            [0, 1],
            [
                props.error ? colors.error : colors.border,
                props.error ? colors.error : colors.primary
            ]
        );

        return {
            borderColor: borderColor,
            borderWidth: focusAnim.value ? 1.5 : 1,
            transform: [{ translateX: shakeAnim.value }],
            // Modern subtle shadow on focus
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: focusAnim.value * 0.08,
            shadowRadius: 4,
            elevation: focusAnim.value ? 2 : 0,
        };
    });

    return (
        <View style={Styles.container}>
            {props.label && (
                <Text style={[Styles.label, { color: props.error ? colors.error : colors.text }]}>
                    {props.label}
                </Text>
            )}
            <Animated.View style={[Styles.inputWrapper, animatedInputContainerStyle]}>
                {LeftIconComponent && (
                    <View style={Styles.leftIconContainer}>
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
                        Styles.input, 
                        isPasswordField && { paddingRight: wp(12) },
                        LeftIconComponent && { paddingLeft: scaleFont(42) }
                    ]}
                    placeholderTextColor={colors.textTertiary}
                />
                {isPasswordField && (
                    <Pressable
                        style={Styles.eyeIconContainer}
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
            </Animated.View>
            {props.error && <Text style={Styles.errorText}>{props.error}</Text>}
        </View>
    );
};

export default AppInput;

const Styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: spacing.md,
    },
    label: {
        marginBottom: spacing.xs,
        fontWeight: '600',
        fontSize: typography.small,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        backgroundColor: colors.surface,
        borderRadius: radius.xl, // Premium round borders
        overflow: 'hidden',
    },
    input: {
        flex: 1,
        padding: spacing.md,
        color: colors.text,
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
        marginLeft: spacing.xs,
    }
});
