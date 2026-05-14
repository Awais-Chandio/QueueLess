import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text, FlatList } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import EmptyState from "../../components/common/EmptyState";
import { supabase } from "../../services/supabase/client";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "CenterDetails">;

type Center = {
  id: string;
  name: string;
  city: string;
  address: string;
  image_url?: string;
};

const CentersScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("centers")
      .select("*");

    if (error) {
      console.log("Centers error:", error.message);
      setCenters([]);
    } else {
      setCenters(data || []);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text>Loading centers...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (centers.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Centers Found"
          subtitle="Database se koi centers nahi mile"
          buttonTitle="Retry"
          onButtonPress={fetchCenters}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Centers</Text>

        <FlatList
          data={centers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.city}</Text>
              <Text style={styles.meta}>{item.address}</Text>

              <Text
                style={styles.link}
                onPress={() =>
                  navigation.navigate("CenterDetails", {
                    centerId: item.id,
                  })
                }
              >
                View Details →
              </Text>
            </View>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default CentersScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  name: {
    fontSize: typography.body,
    fontWeight: "bold",
    color: colors.text,
  },
  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  link: {
    marginTop: spacing.sm,
    color: colors.primary,
  },
});