import React from 'react';
import { View, StyleSheet, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Bell, MapPin } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import ProfileAvatar from './ProfileAvatar';
import IconButton from './IconButton';

interface AnimatedHeaderProps {
  title: string;
  subtitle?: string;
  avatarUri?: string | null;
  location?: string | null;
  onPressAvatar?: () => void;
  onPressNotifications?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const AnimatedHeader: React.FC<AnimatedHeaderProps> = ({
  title,
  subtitle,
  avatarUri,
  location,
  onPressAvatar,
  onPressNotifications,
  style,
}) => {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={[styles.header, { marginBottom: spacing.lg, marginTop: spacing.sm }, style]}>
      <View style={styles.headerText}>
        {subtitle && (
          <Text style={[styles.welcomeText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {subtitle}
          </Text>
        )}
        <Text style={[styles.nameText, { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800' }]}>
          {title}
        </Text>
        
        {location && (
          <View style={[styles.locationChip, { backgroundColor: colors.border + '20', borderColor: colors.border + '40' }]}>
            <MapPin size={11} color={colors.primary} />
            <Text style={[styles.locationText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              {location}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.headerRight}>
        {onPressNotifications && (
          <IconButton
            icon={Bell}
            onPress={onPressNotifications}
            style={{ marginRight: spacing.md }}
          />
        )}
        {onPressAvatar && (
          <Pressable
            onPress={onPressAvatar}
            style={({ pressed }) => [
              styles.avatarRing,
              { borderColor: colors.primary + '30' },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ProfileAvatar uri={avatarUri} size={44} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  welcomeText: {
    fontWeight: '600',
  },
  nameText: {
    letterSpacing: 0.2,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 0.8,
    marginTop: 6,
  },
  locationText: {
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 2,
  },
});

export default AnimatedHeader;
