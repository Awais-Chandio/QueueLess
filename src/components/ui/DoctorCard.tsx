import React from 'react';
import { View, StyleSheet, Text, Image, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Stethoscope, CheckCircle, XCircle } from 'lucide-react-native';
import Card from './Card';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

interface DoctorCardProps {
  name: string;
  specialization: string | null;
  photoUrl?: string | null;
  isActive?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const DoctorCard: React.FC<DoctorCardProps> = ({
  name,
  specialization,
  photoUrl,
  isActive = true,
  selected = false,
  onPress,
  style,
}) => {
  const { colors, spacing, typography, radius } = useTheme();

  return (
    <Card
      variant={selected ? 'outlined' : 'elevated'}
      onPress={onPress}
      style={[
        style,
        selected && {
          borderColor: colors.primary,
          borderWidth: 2,
          backgroundColor: colors.primary + '05',
        },
      ]}
      containerStyle={styles.container}
    >
      <View style={styles.content}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={[styles.avatar, { borderRadius: radius.lg }]} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight, borderRadius: radius.lg }]}>
            <Stethoscope size={scaleFont(24)} color={colors.primary} />
          </View>
        )}

        <View style={styles.infoGroup}>
          <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
            {name}
          </Text>
          <Text style={[styles.specialization, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {specialization || 'General Specialist'}
          </Text>
          
          <View style={styles.statusRow}>
            {isActive ? (
              <>
                <CheckCircle size={scaleFont(12)} color={colors.success} style={styles.statusIcon} />
                <Text style={[styles.statusText, { color: colors.success, fontSize: typography.sizes.xs }]}>
                  On Duty
                </Text>
              </>
            ) : (
              <>
                <XCircle size={scaleFont(12)} color={colors.disabled} style={styles.statusIcon} />
                <Text style={[styles.statusText, { color: colors.disabled, fontSize: typography.sizes.xs }]}>
                  Off Duty
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGroup: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '700',
  },
  specialization: {
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontWeight: '700',
  },
});

export default DoctorCard;
