import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Toast, {
  type ToastConfig,
  type ToastConfigParams,
} from 'react-native-toast-message';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { ToastType } from '../../services/toastService';

/**
 * The app-wide toast surface.
 *
 * Replaces a hand-rolled toast that imported the *static light* palette, so
 * every toast rendered as light-on-white in dark mode, and that signalled its
 * kind with background colour alone — unreadable for anyone who cannot
 * distinguish the hues. Each toast now carries an icon and a text label as well
 * as the colour, and reads its colours from the active theme.
 *
 * Presentation only: `toastService` is unchanged, so all ~110 existing call
 * sites keep working.
 */

const ICONS: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: 'Done',
  error: 'Something went wrong',
  warning: 'Heads up',
  info: 'Info',
};

const ToastCard: React.FC<ToastConfigParams<unknown> & { kind: ToastType }> = ({
  text1,
  text2,
  kind,
  onPress,
}) => {
  const { colors, spacing, radius, shadows, typography, sizing } = useTheme();
  const { width } = useWindowDimensions();

  const tone = colors.status[kind];
  const Icon = ICONS[kind];

  // A toast is a surface with a coloured accent, not a block of saturated
  // colour: the message has to stay readable, and a full-bleed error red at the
  // top of a clinical screen reads as an alarm.
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${text1 ?? DEFAULT_TITLES[kind]}. ${text2 ?? ''}`.trim()}
      style={[
        styles.card,
        shadows.lg,
        {
          width: Math.min(width - spacing.lg * 2, 520),
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderColor: colors.border,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: tone.dot, borderTopLeftRadius: radius.card, borderBottomLeftRadius: radius.card }]} />

      <View style={[styles.iconWell, { backgroundColor: tone.bg, borderRadius: radius.sm }]}>
        <Icon size={sizing.icon.md} color={tone.dot} />
      </View>

      <View style={styles.body}>
        <Text
          style={[typography.roles.label, { color: colors.text, fontWeight: '600' }]}
          numberOfLines={1}
        >
          {text1 ?? DEFAULT_TITLES[kind]}
        </Text>
        {text2 ? (
          <Text
            style={[typography.roles.caption, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={3}
          >
            {text2}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onPress ?? (() => Toast.hide())}
        hitSlop={sizing.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        style={styles.dismiss}
      >
        <X size={sizing.icon.sm} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
};

const ToastMessage = () => {
  const insets = useSafeAreaInsets();
  const { spacing } = useTheme();

  const config = useMemo<ToastConfig>(
    () => ({
      success: props => <ToastCard {...props} kind="success" />,
      error: props => <ToastCard {...props} kind="error" />,
      warning: props => <ToastCard {...props} kind="warning" />,
      info: props => <ToastCard {...props} kind="info" />,
    }),
    [],
  );

  // Clears the status bar, notch and Dynamic Island on every device rather
  // than assuming a fixed offset.
  return <Toast config={config} topOffset={insets.top + spacing.sm} />;
};

export default ToastMessage;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconWell: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  body: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  dismiss: {
    paddingTop: 2,
  },
});
