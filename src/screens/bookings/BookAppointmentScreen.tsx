import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import { colors, spacing, typography } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";

type BookAppointmentRouteProp = RouteProp<AppStackParamList, "BookAppointment">;

const BookAppointmentScreen = () => {
  const route = useRoute<BookAppointmentRouteProp>();
  const centerId = route.params?.centerId;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Book Appointment</Text>
        <Text style={styles.subtitle}>
          Booking form placeholder{centerId ? ` for center ${centerId}` : ""}.
        </Text>
      </View>
    </ScreenWrapper>
  );
};

export default BookAppointmentScreen;

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
