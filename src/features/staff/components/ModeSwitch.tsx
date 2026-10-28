import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stethoscope, Users } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { useAuthStore } from '../../../store/authStore';
import { hasModeSwitch, type AppMode } from '../../../utils/roleMapping';

const MODES: { id: AppMode; label: string; Icon: typeof Users }[] = [
  { id: 'clinic', label: 'Clinic', Icon: Users },
  { id: 'doctor', label: 'Meri queue', Icon: Stethoscope },
];

/** "Clinic" / "Meri queue" for an owner who is also a doctor; nothing for anyone else. */
export const ModeSwitch = () => {
  const { colors, spacing, radius } = useTheme();
  const role = useAuthStore(state => state.role);
  const workspaces = useAuthStore(state => state.workspaces);
  const mode = useAuthStore(state => state.appMode);
  const setMode = useAuthStore(state => state.setAppMode);
  if (!hasModeSwitch(role, workspaces)) return null;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { backgroundColor: colors.tint.primary, borderRadius: radius.md, padding: spacing.xs, marginBottom: spacing.md }]}
    >
      {MODES.map(({ id, label, Icon }) => {
        const active = mode === id;
        const fg = active ? colors.onPrimary : colors.primary;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => setMode(id)}
            style={[
              styles.item,
              { borderRadius: radius.sm, paddingVertical: spacing.sm, backgroundColor: active ? colors.primary : undefined },
            ]}
          >
            <Icon size={16} color={fg} />
            <AppText variant="label" weight="700" style={{ color: fg, marginStart: spacing.xs }}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});

export default ModeSwitch;
