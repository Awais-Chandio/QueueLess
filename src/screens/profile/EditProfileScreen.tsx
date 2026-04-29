import React from "react";
import { View, StyleSheet, Text } from "react-native";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppInput from "../../components/common/AppInput";
import AppButton from "../../components/common/AppButton";
import { colors, spacing, typography } from "../../theme";

const EditProfileScreen = () => {
  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Profile form placeholder.</Text>
        <AppInput
          label="Full Name"
          placeholder="Full name"
          value=""
          onChangeText={() => { }}
          error="Validation message placeholder"
        />
        <AppButton title="Save Changes" onPress={() => { }} disabled />
      </View>
    </ScreenWrapper>
  );
};

export default EditProfileScreen;

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
