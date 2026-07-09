import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Calendar, Clock, MapPin, Hash, Stethoscope, Heart, Smile } from 'lucide-react-native';
import Card from './Card';
import StatusBadge from './StatusBadge';
import AppButton from './AppButton';
import AnimatedCard from './AnimatedCard';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import type { AppointmentFull } from '../../types/appointment';
import {
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
} from '../../features/appointments/utils/appointmentTime';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../services/bookingService';

interface AppointmentTileProps {
  item: AppointmentFull;
  index: number;
  onPress: () => void;
  onPressQueue?: () => void;
}

const getServiceIcon = (serviceName: string) => {
  const name = (serviceName || '').toLowerCase();
  if (name.includes('pediatric')) return { icon: Smile, color: '#0891B2' };
  if (name.includes('cardio') || name.includes('heart')) return { icon: Heart, color: '#EF4444' };
  if (name.includes('dental') || name.includes('teeth')) return { icon: Hash, color: '#F59E0B' };
  return { icon: Stethoscope, color: '#0E7490' };
};

export const AppointmentTile: React.FC<AppointmentTileProps> = ({
  item,
  index,
  onPress,
  onPressQueue,
}) => {
  const { colors, spacing, typography, radius } = useTheme();
  const { resolvedStatus, isExpired, isNoShow } = getAppointmentStatusState(item);
  const { label: statusLabel } = getStatusDisplayProperties(resolvedStatus);
  const serviceIconInfo = getServiceIcon(item.service_name ?? '');

  return (
    <AnimatedCard delay={Math.min(index * 60, 300)}>
      <Card
        onPress={onPress}
        style={{ padding: spacing.md, borderRadius: radius.xl }}
        containerStyle={styles.container}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.serviceIconWrapper, { backgroundColor: serviceIconInfo.color + '12' }]}>
            <serviceIconInfo.icon size={18} color={serviceIconInfo.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
              {item.service_name ?? 'Service'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs / 2 }}>
              <MapPin size={scaleFont(12)} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginLeft: spacing.xs, flex: 1 }} numberOfLines={1}>
                {item.center_name ?? 'Center'}
              </Text>
            </View>
          </View>
          <StatusBadge
            status={resolvedStatus}
            label={statusLabel}
            size="sm"
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border + '40', marginVertical: spacing.md }]} />

        <View style={styles.detailsRow}>
          <View style={styles.detailBlock}>
            <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
              <Calendar size={12} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{getAppointmentDateLabel(item)}</Text>
            </View>
          </View>

          <View style={styles.detailBlock}>
            <View style={[styles.detailIconPill, { backgroundColor: `${colors.info}10` }]}>
              <Clock size={12} color={colors.info} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{getAppointmentTimeLabel(item)}</Text>
            </View>
          </View>

          {typeof item.token_number === 'number' && (
            <View style={styles.detailBlock}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
                <Hash size={12} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.detailLabel}>Token</Text>
                <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '800' }]}>#{item.token_number}</Text>
              </View>
            </View>
          )}
        </View>

        {onPressQueue && ['pending', 'confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedStatus) && !isExpired && !isNoShow && (
          <AppButton
            title="View Live Queue"
            variant="outline"
            onPress={onPressQueue}
            style={{ marginTop: spacing.md }}
          />
        )}
      </Card>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: scaleFont(10),
  },
  serviceIconWrapper: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: scaleFont(8),
  },
  detailBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(6),
    minWidth: '28%',
  },
  detailIconPill: {
    width: scaleFont(26),
    height: scaleFont(26),
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
});

export default AppointmentTile;
