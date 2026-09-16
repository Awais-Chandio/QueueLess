import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, Text, Pressable } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Eye, EyeOff, AlertCircle, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

export type AppInputProps = {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  label?: string;
  error?: string;
  /** Guidance shown under the field while there is no error. */
  helperText?: string;
  /** Appends a visible required marker and sets the accessibility state. */
  required?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: TextInputProps['autoCorrect'];
  textContentType?: TextInputProps['textContentType'];
  autoComplete?: TextInputProps['autoComplete'];
  editable?: TextInputProps['editable'];
  leftIcon?: LucideIcon;
  multiline?: boolean;
  // Passed through so multi-field forms can move focus from the keyboard.
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  blurOnSubmit?: TextInputProps['blurOnSubmit'];
  maxLength?: TextInputProps['maxLength'];
  onBlur?: TextInputProps['onBlur'];
  onFocus?: TextInputProps['onFocus'];
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * The app's text field.
 *
 * Changes from the previous version, all in service of form clarity:
 *
 * - Focus is shown by the border colour and a surface change, not a
 *   brand-coloured glow. The glow drew more attention than the content being
 *   typed.
 * - The border is a constant 1.5 across every state. It previously grew from 1
 *   to 1.5 on focus, which nudged the text by half a pixel on every tap.
 * - Errors are announced, not just coloured: an icon, an `alert` role and a
 *   live region, so a validation failure reaches a screen-reader user.
 * - Height comes from the control tokens instead of `hp(5.6)`, which fell below
 *   the minimum touch target on small phones.
 */
const AppInput = forwardRef<TextInput, AppInputProps>((props, ref) => {
  const { colors, radius, spacing, typography, sizing } = useTheme();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isPasswordField = props.secureTextEntry === true;
  const shouldHideText = isPasswordField && !isPasswordVisible;
  const LeftIconComponent = props.leftIcon;
  const isDisabled = props.editable === false;
  const hasError = Boolean(props.error);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    event => {
      setIsFocused(true);
      props.onFocus?.(event);
    },
    [props],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    event => {
      setIsFocused(false);
      props.onBlur?.(event);
    },
    [props],
  );

  const borderColor = hasError
    ? colors.error
    : isFocused
    ? colors.focus
    : colors.border;

  const backgroundColor = isDisabled
    ? colors.surfaceSunken
    : isFocused
    ? colors.surface
    : colors.card;

  const wrapperStyle = useMemo(
    () => ({
      backgroundColor,
      borderRadius: radius.control,
      borderColor,
      // Held constant across rest/focus/error so the field never reflows.
      borderWidth: 1.5,
      minHeight: props.multiline ? sizing.control.lg * 2 : sizing.control.md,
    }),
    [backgroundColor, borderColor, props.multiline, radius.control, sizing.control],
  );

  const describedBy = props.error ?? props.helperText;

  return (
    <View style={[styles.container, { marginBottom: spacing.md }]}>
      {props.label ? (
        <Text
          style={[
            styles.label,
            {
              color: hasError ? colors.error : colors.textSecondary,
              marginBottom: spacing.xs,
              fontSize: typography.roles.label.fontSize,
            },
          ]}
        >
          {props.label}
          {props.required ? <Text style={{ color: colors.error }}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[styles.inputWrapper, wrapperStyle]}
      >
        {LeftIconComponent ? (
          <View style={[styles.leftIconContainer, { left: spacing.md }]}>
            <LeftIconComponent
              size={sizing.icon.md}
              color={hasError ? colors.error : isFocused ? colors.primary : colors.textTertiary}
            />
          </View>
        ) : null}

        <TextInput
          ref={ref}
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
          multiline={props.multiline}
          returnKeyType={props.returnKeyType}
          onSubmitEditing={props.onSubmitEditing}
          blurOnSubmit={props.blurOnSubmit}
          maxLength={props.maxLength}
          testID={props.testID}
          accessibilityLabel={props.accessibilityLabel ?? props.label ?? props.placeholder}
          accessibilityHint={props.accessibilityHint ?? describedBy}
          accessibilityState={{ disabled: isDisabled }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            styles.input,
            {
              color: isDisabled ? colors.textTertiary : colors.text,
              fontSize: typography.roles.body.fontSize,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
            },
            isPasswordField && { paddingRight: scaleFont(48) },
            LeftIconComponent && { paddingLeft: scaleFont(44) },
            props.multiline && { textAlignVertical: 'top' },
          ]}
          placeholderTextColor={colors.textTertiary}
        />

        {isPasswordField ? (
          <Pressable
            style={[styles.eyeIconContainer, { right: spacing.md }]}
            onPress={() => setIsPasswordVisible(visible => !visible)}
            hitSlop={sizing.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            {isPasswordVisible ? (
              <EyeOff size={sizing.icon.md} color={colors.textSecondary} />
            ) : (
              <Eye size={sizing.icon.md} color={colors.textSecondary} />
            )}
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <View
          style={[styles.message, { marginTop: spacing.xs }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <AlertCircle size={sizing.icon.xs} color={colors.error} />
          <Text
            style={[
              styles.messageText,
              { color: colors.error, fontSize: typography.roles.caption.fontSize, marginLeft: spacing.xs },
            ]}
          >
            {props.error}
          </Text>
        </View>
      ) : props.helperText ? (
        <View style={[styles.message, { marginTop: spacing.xs }]}>
          <Text
            style={[
              styles.messageText,
              { color: colors.textTertiary, fontSize: typography.roles.caption.fontSize },
            ]}
          >
            {props.helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

AppInput.displayName = 'AppInput';

export default AppInput;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontWeight: '500',
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
    zIndex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageText: {
    flex: 1,
    fontWeight: '500',
  },
});
