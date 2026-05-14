import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";
import { colors, spacing, typography } from "../../theme";
import { supabase } from "../../services/supabase/client";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "CenterDetails">;
type CenterDetailsRouteProp = RouteProp<AppStackParamList, "CenterDetails">;

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

const CenterDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CenterDetailsRouteProp>();

  const { centerId } = route.params;

  const [center, setCenter] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    fetchCenter();
    fetchServices();
  }, [centerId]);

  const fetchCenter = async () => {
    const { data } = await supabase
      .from("centers")
      .select("*")
      .eq("id", centerId)
      .single();

    setCenter(data);
  };

  const fetchServices = async () => {
    const { data } = await supabase
      .from("center_services")
      .select("*")
      .eq("center_id", centerId);

    setServices(data || []);
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>
          {center?.name || "Loading..."}
        </Text>

        <Text style={styles.subtitle}>
          {center?.city} • {center?.address}
        </Text>

        <Text style={styles.section}>Services</Text>

        {services.map((s) => (
          <View key={s.id} style={styles.serviceCard}>
            <Text style={styles.serviceName}>{s.name}</Text>
            <Text style={styles.meta}>
              {s.duration_minutes} min • Rs {s.price}
            </Text>
          </View>
        ))}

        <AppButton
          title="Book Appointment"
          onPress={() =>
            navigation.navigate("BookAppointment", { centerId })
          }
        />
      </View>
    </ScreenWrapper>
  );
};

export default CenterDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "bold",
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  section: {
    fontSize: typography.body,
    fontWeight: "bold",
    marginTop: spacing.md,
  },
  serviceCard: {
    padding: spacing.md,
    backgroundColor: "#fff",
    marginTop: spacing.sm,
    borderRadius: 10,
  },
  serviceName: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
});