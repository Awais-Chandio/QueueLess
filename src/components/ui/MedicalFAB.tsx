import React from 'react';
import { StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Plus } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

interface MedicalFABProps {
  onPress: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const MedicalFAB: React.FC<MedicalFABProps> = ({
  onPress,
  icon,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={colors.gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {icon || <Plus size={scaleFont(24)} color="#FFF" />}
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#0E7490',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  gradient: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
});

export default MedicalFAB;
