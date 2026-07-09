import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Card from './Card';

interface MedicalCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'elevated' | 'outlined' | 'flat' | 'gradient';
  disabled?: boolean;
}

export const MedicalCard: React.FC<MedicalCardProps> = ({
  children,
  style,
  containerStyle,
  onPress,
  variant = 'elevated',
  disabled = false,
}) => {
  return (
    <Card
      variant={variant}
      onPress={onPress}
      disabled={disabled}
      style={style}
      containerStyle={containerStyle}
    >
      {children}
    </Card>
  );
};

export default MedicalCard;
