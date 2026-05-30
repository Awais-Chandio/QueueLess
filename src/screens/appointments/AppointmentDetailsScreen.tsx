import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";
import { colors, spacing, typography } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "AppointmentDetails">;
type AppointmentDetailsRouteProp = RouteProp<AppStackParamList, "AppointmentDetails">;

const AppointmentDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AppointmentDetailsRouteProp>();
  const appointmentId = route.params?.appointmentId;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Appointment Details</Text>
        <Text style={styles.subtitle}>
          View the latest status and appointment details.
        </Text>
        <AppButton
          title="View Queue Status"
          disabled={!appointmentId}
          onPress={() => {
            if (!appointmentId) return;

            navigation.navigate("QueueStatus", { appointmentId });
          }}
        />
      </View>
    </ScreenWrapper>
  );
};

export default AppointmentDetailsScreen;

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
