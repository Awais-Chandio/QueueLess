import React from 'react';
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

export interface SectionTitleProps extends SectionHeaderProps {}

export const SectionTitle: React.FC<SectionTitleProps> = (props) => {
  return <SectionHeader {...props} />;
};

export default SectionTitle;
