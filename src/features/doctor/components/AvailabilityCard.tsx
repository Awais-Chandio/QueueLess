import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { Coffee, AlertCircle } from 'lucide-react-native';

interface AvailabilityCardProps {
  isOnBreak: boolean;
  onToggleBreak: (value: boolean) => void;
}

export const AvailabilityCard = ({ isOnBreak, onToggleBreak }: AvailabilityCardProps) => {
  const { colors, typography, radius } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={[styles.iconContainer, { backgroundColor: isOnBreak ? colors.warning + '15' : colors.primary + '10' }]}>
            <Coffee size={20} color={isOnBreak ? colors.warning : colors.primary} />
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.sm }]}>
              Break Mode Status
            </Text>
            <Text style={[styles.subtitle, { color: isOnBreak ? colors.warning : colors.success, fontSize: typography.sizes.xs }]}>
              {isOnBreak ? 'Currently on Break' : 'Active / Serving'}
            </Text>
          </View>
        </View>
        <Switch
          value={isOnBreak}
          onValueChange={onToggleBreak}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
        />
      </View>

      <View style={[styles.infoBox, { backgroundColor: colors.background, borderRadius: radius.lg }]}>
        <AlertCircle size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
        <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: 10 }]} numberOfLines={2}>
          {isOnBreak
            ? 'Patients will see you are on break. Consulting tokens are held but users can still queue.'
            : 'Break mode is off. Patients see you as active in real-time consultations.'}
        </Text>
      </View>
    </View>
  );
};

import { Platform } from 'react-native';

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '700',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  infoText: {
    flex: 1,
    fontWeight: '500',
    lineHeight: 14,
  },
});
