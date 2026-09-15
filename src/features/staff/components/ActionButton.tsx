import React from 'react';
import AppButton from '../../../components/ui/AppButton';
import { useTheme } from '../../../hooks/useTheme';
import type { QueueAction } from '../screens/StaffDashboardScreen';

interface ActionButtonProps {
  action: QueueAction;
  label: string;
  variant: 'primary' | 'outline' | 'danger';
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

const ActionButtonComponent = ({ label, variant, loading, disabled, onPress }: ActionButtonProps) => {
  const { typography } = useTheme();

  return (
    <AppButton
      title={label}
      variant={variant}
      loading={loading}
      disabled={disabled}
      style={{ flexGrow: 1, minWidth: '45%' }}
      textStyle={{ fontSize: typography.sizes.sm }}
      onPress={onPress}
    />
  );
};

export const ActionButton = React.memo(ActionButtonComponent);
