import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/spacing';
import { sizing } from '../theme/sizing';

/**
 * How much room a scrolling screen must leave at its bottom so the last row is
 * not hidden by the floating tab bar.
 *
 * The bar is `position: 'absolute'`, so React Navigation does not inset the
 * scene for it — the scene is full height and the bar is painted on top. Before
 * this, `ScreenWrapper` reserved ~16pt while the bar occupies roughly 62pt plus
 * its bottom offset, so the final item on every tab screen scrolled underneath.
 *
 * `BottomTabBarHeightContext` is read instead of `useBottomTabBarHeight()`
 * because the hook throws outside a tab navigator, and this wrapper is used by
 * stack screens too. A `null` context means "not inside tabs", which is the
 * common case and correctly reserves nothing.
 */
export const useTabBarInset = (): number => {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();

  if (tabBarHeight == null) {
    return 0;
  }

  // The measured bar height, the gap the navigator leaves below it, and a
  // breathing gap so content stops short of the bar rather than touching it.
  return tabBarHeight + insets.bottom + spacing.md;
};

/** The reserve to use when the tab bar height cannot be measured. */
export const FALLBACK_TAB_BAR_INSET = sizing.tabBar.reserve;
