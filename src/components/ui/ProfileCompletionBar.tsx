import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import { ProgressBar } from './ProgressBar';

interface ProfileCompletionBarProps {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAvatar: boolean;
}

export const ProfileCompletionBar: React.FC<ProfileCompletionBarProps> = ({
  hasName,
  hasEmail,
  hasPhone,
  hasAvatar,
}) => {
  const { colors, spacing } = useTheme();

  const totalFields = 4;
  const filledFields = [hasName, hasEmail, hasPhone, hasAvatar].filter(Boolean).length;
  const progress = filledFields / totalFields;
  const percent = Math.round(progress * 100);

  const barColor =
    percent === 100
      ? colors.success
      : percent >= 50
      ? colors.primary
      : colors.warning;

  return (
    <View style={[styles.container, { marginTop: spacing.sm }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Profile Completion
        </Text>
        <Text style={[styles.percent, { color: barColor }]}>{percent}%</Text>
      </View>
      <ProgressBar progress={progress} color={barColor} height={scaleFont(5)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: scaleFont(4),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scaleFont(4),
  },
  label: {
    fontSize: scaleFont(12),
    fontWeight: '500',
  },
  percent: {
    fontSize: scaleFont(12),
    fontWeight: '700',
  },
});

export default ProfileCompletionBar;
