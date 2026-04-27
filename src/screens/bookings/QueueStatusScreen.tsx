import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import { colors, spacing, typography } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";

type QueueStatusRouteProp = RouteProp<AppStackParamList, "QueueStatus">;

const QueueStatusScreen = () => {
  const route = useRoute<QueueStatusRouteProp>();
  const bookingId = route.params?.bookingId;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Queue Status</Text>
        <Text style={styles.subtitle}>
          Queue status placeholder{bookingId ? ` for booking ${bookingId}` : ""}.
        </Text>
      </View>
    </ScreenWrapper>
  );
};

export default QueueStatusScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
});
