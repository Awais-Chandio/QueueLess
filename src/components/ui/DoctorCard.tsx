import React from 'react';
import { View, StyleSheet, Text, Image, Pressable } from 'react-native';
import { Stethoscope, CheckCircle, XCircle, Edit2, Trash2, ShieldAlert } from 'lucide-react-native';
import Card from './Card';
import Badge from './Badge';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';

interface DoctorCardProps {
  doctor: any;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

export const DoctorCard: React.FC<DoctorCardProps> = ({
  doctor,
  onEdit,
  onToggleStatus,
  onDelete,
}) => {
  const { colors, spacing, typography, radius } = useTheme();

  const servicesText = doctor.doctor_services
    ? doctor.doctor_services
        .map((ds: any) => ds.services?.name)
        .filter(Boolean)
        .join(', ')
    : '';

  const isDoctorActive = doctor.status === 'active' || doctor.is_active;

  return (
    <Card variant="elevated" containerStyle={styles.container}>
      <View style={styles.content}>
        {doctor.photo_url ? (
          <Image source={{ uri: doctor.photo_url }} style={[styles.avatar, { borderRadius: radius.lg }]} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '12', borderRadius: radius.lg }]}>
            <Stethoscope size={28} color={colors.primary} />
          </View>
        )}

        <View style={styles.infoGroup}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]} numberOfLines={1}>
              {doctor.name}
            </Text>
            <Badge
              label={isDoctorActive ? 'Active' : 'Inactive'}
              variant={isDoctorActive ? 'success' : 'error'}
            />
          </View>

          {doctor.qualification ? (
            <Text style={[styles.qualification, { color: colors.textSecondary, fontSize: typography.sizes.xs }]} numberOfLines={1}>
              {doctor.qualification}
            </Text>
          ) : null}

          {doctor.employee_code ? (
            <Text style={[styles.employeeCode, { color: colors.textSecondary, fontSize: typography.caption }]}>
              Emp Code: <Text style={{ fontWeight: '700', color: colors.text }}>{doctor.employee_code}</Text>
            </Text>
          ) : null}

          <View style={[styles.metaRow, { marginTop: spacing.xs }]}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary, fontSize: typography.caption }]}>Center:</Text>
            <Text style={[styles.metaValue, { color: colors.text, fontSize: typography.caption }]} numberOfLines={1}>
              {doctor.service_centers?.name || 'Unassigned Center'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary, fontSize: typography.caption }]}>Services:</Text>
            <Text style={[styles.metaValue, { color: colors.text, fontSize: typography.caption }]} numberOfLines={1}>
              {servicesText || 'No assigned services'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary, fontSize: typography.caption }]}>Consultation Fee:</Text>
            <Text style={[styles.metaValue, { color: colors.primary, fontSize: typography.caption, fontWeight: '800' }]}>
              {doctor.fee ? `Rs. ${doctor.fee}` : 'Free'}
            </Text>
          </View>

          {/* Action Row */}
          <View style={[styles.actionRow, { borderTopColor: colors.border + '50', paddingTop: spacing.sm, marginTop: spacing.sm }]}>
            <Pressable
              onPress={onToggleStatus}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: isDoctorActive ? colors.warning : colors.success,
                  backgroundColor: pressed ? (isDoctorActive ? colors.warning + '12' : colors.success + '12') : 'transparent',
                  borderRadius: radius.md,
                },
              ]}
            >
              <Text style={[styles.actionText, { color: isDoctorActive ? colors.warning : colors.success, fontSize: typography.sizes.xs }]}>
                {isDoctorActive ? 'Deactivate' : 'Activate'}
              </Text>
            </Pressable>

            <View style={styles.rightActions}>
              <Pressable
                onPress={onEdit}
                style={({ pressed }) => [
                  styles.iconButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.border + '40' : colors.surface,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Edit2 size={16} color={colors.textSecondary} />
              </Pressable>

              <Pressable
                onPress={onDelete}
                style={({ pressed }) => [
                  styles.iconButton,
                  {
                    borderColor: colors.error + '40',
                    backgroundColor: pressed ? colors.error + '12' : colors.surface,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Trash2 size={16} color={colors.error} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    padding: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGroup: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 8,
  },
  name: {
    fontWeight: '800',
    flex: 1,
  },
  qualification: {
    fontWeight: '600',
    marginBottom: 4,
  },
  employeeCode: {
    marginBottom: 4,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  metaLabel: {
    fontWeight: '600',
    width: 100,
  },
  metaValue: {
    fontWeight: '600',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.2,
  },
  actionText: {
    fontWeight: '800',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DoctorCard;
