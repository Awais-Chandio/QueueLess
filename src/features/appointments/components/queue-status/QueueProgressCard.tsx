import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Info } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AnimatedCard from '../../../../components/ui/AnimatedCard';
import AppText from '../../../../components/ui/AppText';
import { Card } from '../../../../components/ui/Card';
import { CircularProgress } from '../../../../components/ui/CircularProgress';
import { ProgressBar } from '../../../../components/ui/ProgressBar';
import { scaleFont } from '../../../../utils/responsive';
import type { QueueStatusView } from './queueStatusView';

const RING = scaleFont(110);

/** Pulsing halo behind the ring while the patient is being called. */
const CallPulse = () => {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.25, { duration: 1000 }), withTiming(1, { duration: 1000 })), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: (0.35 * (1.25 - pulse.value)) / 0.25,
  }));
  return <Animated.View style={[styles.pulse, { backgroundColor: colors.warning }, style]} />;
};

export const QueueProgressCard = ({ view }: { view: QueueStatusView }) => {
  const { colors, spacing, radius } = useTheme();
  const waitLabel = view.estimatedWaitLabel.includes('min') ? view.estimatedWaitLabel.replace('min', 'minutes') : view.estimatedWaitLabel;

  return (
    <AnimatedCard delay={60}>
      <Card padding="md" style={{ marginBottom: spacing.lg }}>
        {view.isDoctorOnBreak && (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.status.warning.bg, borderColor: colors.status.warning.dot, borderRadius: radius.md, marginBottom: spacing.md, gap: spacing.sm, padding: spacing.sm },
            ]}
          >
            <Info color={colors.warning} size={scaleFont(18)} />
            <View style={styles.flex}>
              <AppText variant="label" weight="800" style={{ color: colors.status.warning.fg }}>
                Department on Break
              </AppText>
              <AppText variant="caption" tone="secondary">
                Queue ETA is paused until service resumes.
              </AppText>
            </View>
          </View>
        )}

        <View style={[styles.row, { gap: spacing.lg }]}>
          <View style={styles.ring}>
            {view.isCalled && <CallPulse />}
            <CircularProgress
              progress={view.ringProgress}
              size={RING}
              strokeWidth={scaleFont(8)}
              color={view.isCalled ? colors.warning : colors.primary}
              trackColor={colors.surfaceSunken}
              centerLabel={view.showQueueMetrics ? view.peopleAheadLabel : '--'}
              centerCaption="Ahead"
            />
          </View>
          <View style={[styles.flex, { gap: spacing.xs }]}>
            {[
              { label: 'Estimated waiting', value: waitLabel },
              { label: 'Patients ahead', value: view.peopleAheadLabel },
            ].map(item => (
              <View key={item.label} style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: spacing.sm }}>
                <AppText variant="caption" tone="secondary" weight="700">
                  {item.label.toUpperCase()}
                </AppText>
                <AppText variant="subtitle" weight="800">
                  {item.value}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <ProgressBar progress={view.progress} color={colors.primary} height={6} />
        </View>
        <AppText variant="caption" tone="secondary" weight="600" align="center" style={{ marginTop: spacing.md }}>
          {view.helperText}
        </AppText>
      </Card>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  ring: {
    width: scaleFont(120),
    height: scaleFont(120),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: scaleFont(112),
    height: scaleFont(112),
    borderRadius: scaleFont(56),
  },
});
