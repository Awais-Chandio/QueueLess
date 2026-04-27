import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import EmptyState from "../../components/common/EmptyState";
import type { AppStackParamList } from "../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "BookingDetails">;

const MyBookingsScreen = () => {
    const navigation = useNavigation<NavigationProp>();

    return (
        <ScreenWrapper>
            <View
                style={styles.container}>
                <Text style={styles.title}>
                    My Bookings
                </Text>
                <Text style={styles.subtitle}>
                    Your bookings will appear here
                </Text>
                <EmptyState
                    title="No bookings yet"
                    subtitle="Your bookings will appear here once you create one."
                    buttonTitle="View Booking Placeholder"
                    onButtonPress={() => navigation.navigate("BookingDetails", { bookingId: "placeholder-booking" })}
                />




            </View>
        </ScreenWrapper>
    )
}

export default MyBookingsScreen;

const styles = StyleSheet.create({

    container: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: typography.h1,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.body,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
        textAlign: 'center',
    },
})
