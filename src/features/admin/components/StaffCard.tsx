import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Edit2, Mail, MapPin, Phone, Trash2, UserRound } from 'lucide-react-native';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import type { StaffProfile } from '../api/staffService';

type StaffCardProps = {
  staff: StaffProfile;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

const StaffCard = ({ staff, deleting, onEdit, onDelete }: StaffCardProps) => {
  const { colors, spacing, typography, radius } = useTheme();

  return (
    <Card variant="elevated" containerStyle={styles.container}>
      <View style={styles.content}>
        <View
          style={[
            styles.avatarPlaceholder,
            { backgroundColor: colors.primary + '12', borderRadius: radius.lg },
          ]}
        >
          <UserRound size={28} color={colors.primary} />
        </View>

        <View style={styles.infoGroup}>
          <Text
            style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}
            numberOfLines={1}
          >
            {staff.full_name || 'Unnamed Staff Member'}
          </Text>

          <View style={[styles.metaRow, { marginTop: spacing.xs }]}>
            <Mail size={14} color={colors.textSecondary} />
            <Text
              style={[styles.metaValue, { color: colors.textSecondary, fontSize: typography.caption }]}
              numberOfLines={1}
            >
              {staff.email || 'No email'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Phone size={14} color={colors.textSecondary} />
            <Text
              style={[styles.metaValue, { color: colors.textSecondary, fontSize: typography.caption }]}
              numberOfLines={1}
            >
              {staff.phone || 'No phone number'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text
              style={[styles.metaValue, { color: colors.text, fontSize: typography.caption }]}
              numberOfLines={2}
            >
              {staff.centers.map(center => center.name).join(', ') || 'Unassigned Center'}
            </Text>
          </View>

          <View
            style={[
              styles.actionRow,
              {
                borderTopColor: colors.border + '50',
                paddingTop: spacing.sm,
                marginTop: spacing.sm,
              },
            ]}
          >
            <Pressable
              onPress={onEdit}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${staff.full_name || 'staff member'}`}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.border + '40' : colors.surface,
                  borderRadius: radius.md,
                  opacity: deleting ? 0.5 : 1,
                },
              ]}
            >
              <Edit2 size={16} color={colors.textSecondary} />
              <Text style={[styles.actionText, { color: colors.text, fontSize: typography.sizes.xs }]}>Edit</Text>
            </Pressable>

            <Pressable
              onPress={onDelete}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${staff.full_name || 'staff member'}`}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: colors.error + '40',
                  backgroundColor: pressed ? colors.error + '12' : colors.surface,
                  borderRadius: radius.md,
                  opacity: deleting ? 0.5 : 1,
                },
              ]}
            >
              <Trash2 size={16} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.error, fontSize: typography.sizes.xs }]}>Delete</Text>
            </Pressable>
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
  avatarPlaceholder: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGroup: {
    flex: 1,
  },
  name: {
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  metaValue: {
    flex: 1,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
  },
  actionButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: {
    fontWeight: '800',
  },
});

export default StaffCard;
