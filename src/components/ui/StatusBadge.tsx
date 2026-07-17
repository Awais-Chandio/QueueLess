import React from 'react';
import { ViewStyle } from 'react-native';
import StatusChip, { StatusChipVariant } from './StatusChip';

export interface StatusBadgeProps {
  status: StatusChipVariant;
  label?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = (props) => {
  return <StatusChip {...props} />;
};

export default StatusBadge;
