import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import AppText from './AppText';

export interface AppBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Fraction of the screen the sheet may occupy. */
  maxHeightPercent?: number;
  /** Set false when the content scrolls itself (a FlatList, for instance). */
  scrollable?: boolean;
  /** Blocks backdrop-tap and swipe-to-dismiss for a decision that must be made. */
  dismissible?: boolean;
}

/**
 * The app's bottom sheet, on `@gorhom/bottom-sheet`.
 *
 * The previous implementation was a plain `Modal` with `animationType="slide"`,
 * which gave no drag handle, no velocity-aware dismissal, and no backdrop fade —
 * it simply appeared. A sheet that responds to the finger is the difference
 * between a panel that feels native and one that feels like a web overlay.
 *
 * The prop signature matches the `Modal`-based sheet it replaces, so call sites
 * migrate by changing the import.
 *
 * Requires `GestureHandlerRootView` and `BottomSheetModalProvider` at the app
 * root; both are installed in `App.tsx`.
 */
export const AppBottomSheet: React.FC<AppBottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  maxHeightPercent = 0.8,
  scrollable = true,
  dismissible = true,
}) => {
  const { colors, spacing, radius, sizing } = useTheme();
  const ref = useRef<BottomSheetModal>(null);

  const snapPoints = useMemo(
    () => [`${Math.round(maxHeightPercent * 100)}%`],
    [maxHeightPercent],
  );

  useEffect(() => {
    if (visible) {
      ref.current?.present();
    } else {
      ref.current?.dismiss();
    }
  }, [visible]);

  // Fires for a swipe-down as well as a programmatic dismiss, so the parent's
  // `visible` state cannot drift out of sync with what is on screen.
  const handleChange = useCallback(
    (index: number) => {
      if (index === -1 && visible) {
        onClose();
      }
    },
    [onClose, visible],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior={dismissible ? 'close' : 'none'}
      />
    ),
    [dismissible],
  );

  const Content = scrollable ? BottomSheetScrollView : BottomSheetView;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      enablePanDownToClose={dismissible}
      enableDynamicSizing={false}
      handleIndicatorStyle={{ backgroundColor: colors.textTertiary, width: 40 }}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
      }}
      style={styles.sheet}
    >
      {title ? (
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.md,
              borderBottomColor: colors.divider,
            },
          ]}
        >
          <AppText variant="section" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          {dismissible ? (
            <Pressable
              onPress={onClose}
              hitSlop={sizing.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.close, { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill }]}
            >
              <X size={sizing.icon.md} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Content
        style={styles.flex}
        contentContainerStyle={
          scrollable
            ? { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }
            : undefined
        }
      >
        {scrollable ? (
          children
        ) : (
          <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}>
            {children}
          </View>
        )}
      </Content>
    </BottomSheetModal>
  );
};

export default AppBottomSheet;

const styles = StyleSheet.create({
  sheet: {
    // The sheet floats over the tab bar, so it carries its own elevation.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
