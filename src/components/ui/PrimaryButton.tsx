import React from 'react';
import AppButton, { AppButtonProps } from './AppButton';

export interface PrimaryButtonProps extends Omit<AppButtonProps, 'variant'> {}

export const PrimaryButton: React.FC<PrimaryButtonProps> = (props) => {
  return <AppButton {...props} variant="primary" />;
};

export default PrimaryButton;
