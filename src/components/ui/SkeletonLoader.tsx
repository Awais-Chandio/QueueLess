import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Skeleton from './Skeleton';

export interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = (props) => {
  return <Skeleton {...props} />;
};

export default SkeletonLoader;
