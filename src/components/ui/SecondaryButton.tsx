import React from 'react';
import AppButton, { AppButtonProps } from './AppButton';

export interface SecondaryButtonProps extends Omit<AppButtonProps, 'variant'> {}

export const SecondaryButton: React.FC<SecondaryButtonProps> = (props) => {
  return <AppButton {...props} variant="secondary" />;
};

export default SecondaryButton;
