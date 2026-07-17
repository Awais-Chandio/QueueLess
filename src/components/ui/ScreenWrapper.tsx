import React from "react";
import { View, StyleSheet, ScrollView, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";
import { hp, wp } from "../../utils/responsive";

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  withPadding?: boolean;
  centered?: boolean;
  edges?: ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>;
}

const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ 
  children, 
  scrollable = false, 
  onRefresh, 
  refreshing = false,
  withPadding = true,
  centered = false,
  edges = ['top', 'bottom', 'left', 'right'],
}) => {
  const { colors, spacing } = useTheme();

  const content = (
    <View
      style={[
        styles.container,
        withPadding && { paddingHorizontal: wp(4), paddingVertical: spacing.lg },
        centered && styles.centeredContent,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scrollable ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, centered && styles.centeredScrollContent]}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
          >
            {content}
          </ScrollView>
        ) : (
          content
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
    paddingBottom: hp(2),
  },
  centeredContent: {
    justifyContent: 'center',
  },
  centeredScrollContent: {
    justifyContent: 'center',
  },
});
