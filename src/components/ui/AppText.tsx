import React, { useMemo } from 'react';
import { Text, type TextProps, type TextStyle, type StyleProp } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { TextRole } from '../../theme/typography';
import type { ColorTheme } from '../../theme/colors';

export type AppTextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'brand'
  | 'onPrimary'
  | 'success'
  | 'warning'
  | 'error';

const TONE_TO_TOKEN: Record<AppTextTone, keyof ColorTheme> = {
  primary: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  brand: 'primary',
  onPrimary: 'onPrimary',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

export interface AppTextProps extends TextProps {
  /**
   * Named role from the type scale. Sets size, weight, line height and
   * tracking. Named `variant` rather than `role` because React Native already
   * uses `role` for the ARIA role.
   */
  variant?: TextRole;
  /** Semantic colour. Use `style` only for one-off colours the scale cannot express. */
  tone?: AppTextTone;
  align?: TextStyle['textAlign'];
  /** Overrides the role's weight without changing its size. */
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/**
 * Typed text.
 *
 * Screens were setting `fontSize` and `fontWeight` by hand, which is how the
 * app ended up with section headings at three different sizes. Picking a
 * variant keeps a kind of information looking the same everywhere.
 *
 * `allowFontScaling` is intentionally left at its default so the OS font-size
 * setting still applies — a healthcare app is exactly where someone is likely
 * to have enlarged their system text.
 */
export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  tone = 'primary',
  align,
  weight,
  style,
  children,
  ...props
}) => {
  const { colors, typography } = useTheme();

  const composed = useMemo<StyleProp<TextStyle>>(
    () => [
      typography.roles[variant],
      { color: colors[TONE_TO_TOKEN[tone]] as string },
      align ? { textAlign: align } : null,
      weight ? { fontWeight: weight } : null,
      style,
    ],
    [align, colors, variant, style, tone, typography.roles, weight],
  );

  return (
    <Text style={composed} {...props}>
      {children}
    </Text>
  );
};

export default AppText;
