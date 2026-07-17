import React from 'react';
import { View, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { Clock, Users, Hash, AlertTriangle } from 'lucide-react-native';
import Card from './Card';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import StatusChip from './StatusChip';
import type { AppointmentStatus } from '../../types/appointment';

interface QueueCardProps {
  currentToken: number;
  yourToken?: number;
  peopleAhead: number;
  estimatedWaitMins: number;
  status: AppointmentStatus | 'doctor_on_break';
  isOnBreak?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const QueueCard: React.FC<QueueCardProps> = ({
  currentToken,
  yourToken,
  peopleAhead,
  estimatedWaitMins,
  status,
  isOnBreak = false,
  onPress,
  style,
}) => {
  const { colors, spacing, typography, radius } = useTheme();

  const isBreak = isOnBreak || status === 'doctor_on_break';

  return (
    <Card
      variant="gradient"
      gradientColors={isBreak ? ['#D97706', '#F59E0B'] : colors.gradients.primary}
      onPress={onPress}
      style={style}
      containerStyle={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.headerTextGroup}>
          <Text style={[styles.title, { color: '#FFF', fontSize: typography.sizes.sm }]}>
            {isBreak ? 'Queue Paused' : 'Live Queue Tracker'}
          </Text>
          {yourToken && (
            <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.85)', fontSize: typography.sizes.xs }]}>
              Your Token: #{yourToken}
            </Text>
          )}
        </View>
        <StatusChip
          status={isBreak ? 'doctor_on_break' : (status as AppointmentStatus)}
          style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 0 }}
          textStyle={{ color: '#FFF', fontWeight: '800' }}
        />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <View style={styles.iconCircle}>
            {isBreak ? (
              <AlertTriangle size={scaleFont(18)} color={isBreak ? '#D97706' : colors.primary} />
            ) : (
              <Hash size={scaleFont(18)} color={colors.primary} />
            )}
          </View>
          <Text style={[styles.metricLabel, { color: 'rgba(255,255,255,0.8)', fontSize: typography.sizes.xs }]}>
            Now Serving
          </Text>
          <Text style={[styles.metricValue, { color: '#FFF', fontSize: typography.sizes.xl }]}>
            {isBreak ? 'Break' : `#${currentToken}`}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.metricItem}>
          <View style={styles.iconCircle}>
            <Users size={scaleFont(18)} color={colors.primary} />
          </View>
          <Text style={[styles.metricLabel, { color: 'rgba(255,255,255,0.8)', fontSize: typography.sizes.xs }]}>
            People Ahead
          </Text>
          <Text style={[styles.metricValue, { color: '#FFF', fontSize: typography.sizes.xl }]}>
            {peopleAhead}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.metricItem}>
          <View style={styles.iconCircle}>
            <Clock size={scaleFont(18)} color={colors.primary} />
          </View>
          <Text style={[styles.metricLabel, { color: 'rgba(255,255,255,0.8)', fontSize: typography.sizes.xs }]}>
            Est. Wait Time
          </Text>
          <Text style={[styles.metricValue, { color: '#FFF', fontSize: typography.sizes.xl }]}>
            {isBreak ? '--' : `${estimatedWaitMins}m`}
          </Text>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTextGroup: {
    gap: 2,
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  metricLabel: {
    fontWeight: '600',
  },
  metricValue: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});

export default QueueCard;
