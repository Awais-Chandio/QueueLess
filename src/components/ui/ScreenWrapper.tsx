import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useTabBarInset } from '../../hooks/useTabBarInset';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  withPadding?: boolean;
  centered?: boolean;
  edges?: ReadonlyArray<Edge>;
  /** Overrides the screen background. Defaults to `colors.background`. */
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The standard screen shell: safe area, background, optional scrolling and
 * pull-to-refresh.
 *
 * Two fixes over the previous version:
 *
 * - Horizontal padding is a fixed token rather than `wp(4)`. A percentage
 *   padding meant the content column grew on every larger phone, so line
 *   lengths and card widths drifted between devices instead of staying put.
 * - Scrollable screens reserve room for the floating tab bar. See
 *   `useTabBarInset` — this is what stopped the last list item on every tab
 *   screen from sliding underneath the bar.
 */
const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  scrollable = false,
  onRefresh,
  refreshing = false,
  withPadding = true,
  centered = false,
  edges = ['top', 'bottom', 'left', 'right'],
  backgroundColor,
  contentContainerStyle,
  testID,
}) => {
  const { colors, spacing } = useTheme();
  const tabBarInset = useTabBarInset();

  // Inside a tab navigator the bar already covers the bottom safe area, so
  // padding for it as well would leave a visible dead strip.
  const resolvedEdges = useMemo<readonly Edge[]>(
    () => (tabBarInset > 0 ? edges.filter(edge => edge !== 'bottom') : edges),
    [edges, tabBarInset],
  );

  const content = (
    <View
      style={[
        styles.container,
        withPadding && {
          paddingHorizontal: spacing.screen,
          paddingVertical: spacing.lg,
        },
        centered && styles.centeredContent,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={resolvedEdges}
      testID={testID}
      style={[styles.safeArea, { backgroundColor: backgroundColor ?? colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollable ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: tabBarInset + spacing.lg },
              centered && styles.centeredScrollContent,
              contentContainerStyle,
            ]}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  progressBackgroundColor={colors.surface}
                />
              ) : undefined
            }
          >
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.safeArea, tabBarInset > 0 && { paddingBottom: tabBarInset }]}>
            {content}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ScreenWrapper;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  centeredContent: {
    justifyContent: 'center',
  },
  centeredScrollContent: {
    justifyContent: 'center',
  },
});
