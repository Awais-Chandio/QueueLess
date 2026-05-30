import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";
import { colors, spacing, typography } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "BookingDetails">;
type BookingDetailsRouteProp = RouteProp<AppStackParamList, "BookingDetails">;

const BookingDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BookingDetailsRouteProp>();
  const bookingId = route.params?.bookingId;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Booking Details</Text>
        <Text style={styles.subtitle}>
          Booking detail placeholder{bookingId ? `: ${bookingId}` : ""}.
        </Text>
        <AppButton
          title="View Queue Status"
          disabled={!bookingId}
          onPress={() => {
            if (!bookingId) return;

            navigation.navigate("QueueStatus", { bookingId });
          }}
        />
      </View>
    </ScreenWrapper>
  );
};

export default BookingDetailsScreen;

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
