import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { Calendar, Trash2 } from 'lucide-react-native';

interface LeaveCardProps {
  leaveDate: string;
  reason: string | null;
  onCancel: () => void;
}

export const LeaveCard = ({ leaveDate, reason, onCancel }: LeaveCardProps) => {
  const { colors, typography, radius } = useTheme();

  const formattedDate = new Date(leaveDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: colors.error + '10' }]}>
          <Calendar size={18} color={colors.error} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.date, { color: colors.text, fontSize: typography.sizes.sm }]}>
            {formattedDate}
          </Text>
          <Text style={[styles.reason, { color: colors.textSecondary, fontSize: 10 }]} numberOfLines={2}>
            Reason: {reason || 'No reason provided.'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.cancelButton, { backgroundColor: colors.error + '10', borderRadius: radius.lg }]}
        onPress={onCancel}
      >
        <Trash2 size={14} color={colors.error} />
      </TouchableOpacity>
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
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  date: {
    fontWeight: '800',
    marginBottom: 2,
  },
  reason: {
    fontWeight: '500',
  },
  cancelButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
