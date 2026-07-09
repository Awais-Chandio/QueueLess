import React from 'react';
import Loader from './Loader';

export interface LoadingStateProps {
  size?: 'small' | 'large';
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = (props) => {
  return <Loader {...props} />;
};

export default LoadingState;
