import React from 'react';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import SegmentedControl from './SegmentedControl';

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Appearance: follow the phone (default), or force light / dark. */
export const ThemeModePicker = () => {
  const mode = useThemeStore(state => state.mode);
  const setMode = useThemeStore(state => state.setMode);
  return <SegmentedControl options={OPTIONS} value={mode} onChange={setMode} accessibilityLabel="Appearance" />;
};

export default ThemeModePicker;
