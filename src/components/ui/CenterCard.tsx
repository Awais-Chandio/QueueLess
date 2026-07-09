import React from 'react';
import { View, StyleSheet, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { MapPin, Clock, ChevronRight } from 'lucide-react-native';
import Card from './Card';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import Badge from './Badge';

interface CenterCardProps {
  name: string;
  address: string | null;
  category: string | null;
  openTime?: string | null;
  closeTime?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const CenterCard: React.FC<CenterCardProps> = ({
  name,
  address,
  category,
  openTime,
  closeTime,
  onPress,
  style,
}) => {
  const { colors, spacing, typography, radius } = useTheme();

  const formattedHours = openTime && closeTime 
    ? `${openTime.substring(0, 5)} - ${closeTime.substring(0, 5)}`
    : '09:00 - 18:00';

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      style={style}
      containerStyle={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]} numberOfLines={1}>
            {name}
          </Text>
          {category && (
            <Badge
              label={category}
              variant="info"
              containerStyle={{ borderRadius: radius.sm }}
            />
          )}
        </View>

        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <MapPin size={scaleFont(14)} color={colors.textSecondary} style={styles.icon} />
          <Text style={[styles.text, { color: colors.textSecondary, fontSize: typography.sizes.xs }]} numberOfLines={1}>
            {address || 'Location information unavailable'}
          </Text>
        </View>

        <View style={[styles.row, { marginTop: spacing.xs }]}>
          <Clock size={scaleFont(14)} color={colors.textSecondary} style={styles.icon} />
          <Text style={[styles.text, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            Hours: {formattedHours}
          </Text>
        </View>
        
        {onPress && (
          <View style={[styles.footer, { borderTopColor: colors.border + '30', marginTop: spacing.md, paddingTop: spacing.sm }]}>
            <Text style={[styles.footerText, { color: colors.primary, fontSize: typography.sizes.xs }]}>
              Book Consultation
            </Text>
            <ChevronRight size={scaleFont(14)} color={colors.primary} />
          </View>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  content: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontWeight: '800',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  footerText: {
    fontWeight: '700',
  },
});

export default CenterCard;
