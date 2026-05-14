import React, { useEffect } from "react";
import { View, StyleSheet, Text, FlatList, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import EmptyState from "../../components/common/EmptyState";

import { useCentersStore } from "../../store/centersStore";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  "CenterDetails"
>;

const CentersScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const { centers, loading, error, fetchCenters } = useCentersStore();

  // 🔥 Load data from Supabase via store
  useEffect(() => {
    fetchCenters();
  }, []);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Centers</Text>
        <Text style={styles.subtitle}>
          Available centers from Supabase
        </Text>

        {/* 🔄 Loading */}
        {loading && <Text>Loading centers...</Text>}

        {/* ❌ Error */}
        {error && (
          <Text style={{ color: "red", textAlign: "center" }}>
            {error}
          </Text>
        )}

        {/* 📭 Empty State */}
        {!loading && centers.length === 0 && (
          <EmptyState
            title="No Centers Available"
            subtitle="Centers will appear here once data is added"
            buttonTitle="Refresh"
            onButtonPress={fetchCenters}
          />
        )}

        {/* 📦 DATA LIST */}
        <FlatList
          data={centers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate("CenterDetails", {
                  centerId: item.id,
                })
              }
            >
              <Text style={styles.cardTitle}>
                {item.name}
              </Text>

              <Text style={styles.cardSub}>
                {item.city}
              </Text>

              <Text style={styles.cardSub}>
                {item.address}
              </Text>
            </TouchableOpacity>
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
    padding: spacing.md,
  },

  title: {
    fontSize: typography.h1,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
  },

  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  card: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 10,
    backgroundColor: "#fff",
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
  },

  cardSub: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});