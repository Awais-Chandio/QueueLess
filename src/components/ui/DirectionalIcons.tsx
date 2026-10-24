import React from 'react';
import { I18nManager, StyleSheet } from 'react-native';
import {
  ArrowLeft as ArrowLeftBase,
  ArrowRight as ArrowRightBase,
  ChevronLeft as ChevronLeftBase,
  ChevronRight as ChevronRightBase,
  ChevronsRight as ChevronsRightBase,
  LogOut as LogOutBase,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';

/**
 * Icons that point along the reading direction (back, forward, "more",
 * sign out). In a right-to-left layout they are mirrored, so "back" still
 * points at the start edge and a row chevron at the end edge. Import these
 * from here instead of `lucide-react-native`; non-directional icons (clock,
 * ticket, users, check) come straight from lucide and never flip.
 *
 * `I18nManager.isRTL` is read at render time: it is fixed for the life of the
 * JS bundle, and the app never forces it (the device locale decides).
 */
function mirrored(Icon: LucideIcon, name: string): React.FC<LucideProps> {
  const Mirrored = (props: LucideProps) => (
    <Icon {...props} style={I18nManager.isRTL ? [styles.flip, props.style] : props.style} />
  );
  Mirrored.displayName = name;
  return Mirrored;
}

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
});

export const ArrowLeft = mirrored(ArrowLeftBase, 'ArrowLeft');
export const ArrowRight = mirrored(ArrowRightBase, 'ArrowRight');
export const ChevronLeft = mirrored(ChevronLeftBase, 'ChevronLeft');
export const ChevronRight = mirrored(ChevronRightBase, 'ChevronRight');
export const ChevronsRight = mirrored(ChevronsRightBase, 'ChevronsRight');
export const LogOut = mirrored(LogOutBase, 'LogOut');
