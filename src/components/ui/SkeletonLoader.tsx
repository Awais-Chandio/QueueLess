import React from 'react';
import { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Skeleton } from './Skeleton';

export interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = (props) => {
  return <Skeleton {...props} />;
};

export default SkeletonLoader;
