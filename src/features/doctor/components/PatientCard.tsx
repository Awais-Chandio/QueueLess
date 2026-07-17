import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { Clock, User } from 'lucide-react-native';

interface PatientCardProps {
  patientName: string;
  tokenNumber: number;
  appointmentTime: string;
  status: string;
}

export const PatientCard = ({ patientName, tokenNumber, appointmentTime, status }: PatientCardProps) => {
  const { colors, typography, radius } = useTheme();

  const getStatusStyle = (currentStatus: string) => {
    const norm = currentStatus.toLowerCase();
    if (norm === 'completed') {
      return { bg: colors.success + '15', text: colors.success };
    }
    if (norm === 'checked_in') {
      return { bg: colors.primary + '15', text: colors.primary };
    }
    if (norm === 'called' || norm === 'serving') {
      return { bg: colors.warning + '15', text: colors.warning };
    }
    if (norm === 'cancelled' || norm === 'skipped') {
      return { bg: colors.error + '15', text: colors.error };
    }
    return { bg: colors.border + '30', text: colors.textSecondary };
  };

  const statusStyle = getStatusStyle(status);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
      <View style={styles.leftSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '08' }]}>
          <User size={18} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.sm }]} numberOfLines={1}>
            {patientName}
          </Text>
          <View style={styles.timeRow}>
            <Clock size={12} color={colors.textSecondary} style={styles.clockIcon} />
            <Text style={[styles.time, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              {appointmentTime}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.rightSection}>
        <Text style={[styles.token, { color: colors.primary, fontSize: typography.sizes.xs }]}>
          Token #{tokenNumber}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusStyle.bg, borderRadius: radius.md }]}>
          <Text style={[styles.badgeText, { color: statusStyle.text, fontSize: 10 }]}>
            {status.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontWeight: '700',
    marginBottom: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockIcon: {
    marginRight: 4,
  },
  time: {
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  token: {
    fontWeight: '800',
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
