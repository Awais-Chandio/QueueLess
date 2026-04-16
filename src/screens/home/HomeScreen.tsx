import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { spacing, colors, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";

const HomeScreen = () => {
    return (
        <ScreenWrapper>
            <View style={styles.container}>
                <Text style={styles.title}>
                    Home
                </Text>
                <Text style={styles.subtitle}>
                    Welcome to QueueLess
                </Text>
                <AppButton
                    title="View Centers"
                    onPress={() => { }}
                />
                <AppButton
                    title="My Bookings"
                    onPress={() => { }}
                />
            </View>
        </ScreenWrapper>

    )
}
export default HomeScreen;

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
    footerText: {
        color: colors.primary,
        marginTop: spacing.md,
        textAlign: 'center',
    }
})