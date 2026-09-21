import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { WifiOff } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import AppText from './AppText';

/**
 * Warns that the realtime connection has dropped.
 *
 * This replaces a bare 8pt dot pinned at `top: 54` in hardcoded green or red.
 * That dot had three problems: it sat on top of screen headers at a fixed
 * offset that ignored the notch, it was permanently visible even when
 * everything was fine, and it carried its meaning in colour alone with no label
 * and no screen-reader text.
 *
 * A healthy connection is the expected state and needs no ornament, so nothing
 * renders until the connection actually drops. This matters on the queue
 * screens, where a stale token number is misleading rather than merely stale.
 */
export const RealtimeIndicator: React.FC<{ connected: boolean }> = ({ connected }) => {
  const { colors, spacing, radius, shadows, sizing } = useTheme();
  const insets = useSafeAreaInsets();

  if (connected) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        exit={{ opacity: 0, translateY: -8 }}
        transition={{ type: 'timing', duration: 220 }}
        accessible
        accessibilityRole="alert"
        accessibilityLabel="Live updates are unavailable. Reconnecting."
        style={[
          styles.pill,
          shadows.md,
          {
            backgroundColor: colors.status.warning.bg,
            borderColor: colors.status.warning.dot,
            borderRadius: radius.pill,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <WifiOff size={sizing.icon.xs} color={colors.status.warning.dot} />
        <AppText
          variant="caption"
          weight="600"
          style={[styles.label, { color: colors.status.warning.fg }]}
        >
          Reconnecting
        </AppText>
      </MotiView>
    </View>
  );
};

export default RealtimeIndicator;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    marginLeft: 6,
  },
});
