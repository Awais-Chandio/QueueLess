import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { Sheet } from '../../../components/ui/Sheet';
import type { DeskCenter } from '../hooks/useReception';

type Props = {
  centers: DeskCenter[];
  selected: DeskCenter;
  onSelect: (centerId: string) => void;
};

/** The clinic name under the title; a picker when the user works at more than one. */
export const CenterPicker = ({ centers, selected, onSelect }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const many = centers.length > 1;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!many}
        accessibilityRole={many ? 'button' : 'text'}
        accessibilityLabel={many ? `Clinic: ${selected.name}. Change clinic` : selected.name}
        style={styles.row}
      >
        <AppText variant="label" tone="secondary" numberOfLines={1}>
          {selected.name}
        </AppText>
        {many && <ChevronDown size={14} color={colors.textSecondary} style={{ marginStart: spacing.xs }} />}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose clinic" maxHeightPercent={0.6}>
        {centers.map(center => (
          <Pressable
            key={center.id}
            onPress={() => {
              onSelect(center.id);
              setOpen(false);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: colors.border,
                borderRadius: radius.control,
                marginBottom: spacing.sm,
                padding: spacing.md,
                backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              },
            ]}
          >
            <AppText variant="bodyStrong" style={styles.flex}>
              {center.name}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {center.organizationName}
            </AppText>
            {center.id === selected.id && <Check size={18} color={colors.primary} style={{ marginStart: spacing.sm }} />}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  flex: {
    flex: 1,
  },
});
