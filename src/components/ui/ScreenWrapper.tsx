import React from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  withPadding?: boolean;
}

const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ 
  children, 
  scrollable = false, 
  onRefresh, 
  refreshing = false,
  withPadding = true
}) => {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.container, withPadding && { padding: spacing.lg }]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
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
  }
});