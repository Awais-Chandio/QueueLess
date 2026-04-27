import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";
import { colors, spacing, typography } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "CenterDetails">;
type CenterDetailsRouteProp = RouteProp<AppStackParamList, "CenterDetails">;

const CenterDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CenterDetailsRouteProp>();
  const centerId = route.params?.centerId;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Center Details</Text>
        <Text style={styles.subtitle}>
          Service center details placeholder{centerId ? `: ${centerId}` : ""}.
        </Text>
        <AppButton
          title="Book Appointment"
          onPress={() => navigation.navigate("BookAppointment", { centerId })}
        />
      </View>
    </ScreenWrapper>
  );
};

export default CenterDetailsScreen;

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
