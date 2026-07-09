import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

interface SectionHeaderProps {
  title: string;
  onPressAction?: () => void;
  actionLabel?: string;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  actionStyle?: TextStyle;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  onPressAction,
  actionLabel = 'See All',
  style,
  titleStyle,
  actionStyle,
}) => {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={[styles.container, { marginBottom: spacing.md, paddingHorizontal: spacing.xs }, style]}>
      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: typography.sizes.md,
            fontWeight: '800',
            letterSpacing: 0.2,
          },
          titleStyle,
        ]}
      >
        {title}
      </Text>
      {onPressAction && (
        <Pressable
          onPress={onPressAction}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text
            style={[
              styles.actionText,
              {
                color: colors.primary,
                fontSize: typography.sizes.sm,
                fontWeight: '700',
              },
              actionStyle,
            ]}
          >
            {actionLabel}
          </Text>
          <ChevronRight size={scaleFont(15)} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {},
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(2),
  },
  actionText: {},
  pressed: {
    opacity: 0.7,
  },
});

export default SectionHeader;
