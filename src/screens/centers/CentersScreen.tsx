import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import EmptyState from "../../components/common/EmptyState";

const CentersScreen = () => {
    return (
        <ScreenWrapper>
            <View style={styles.container}>
                <Text style={styles.title}>
                    Centers
                </Text>
                <Text style={styles.subtitle}>
                    Available centers will appear here.
                </Text>
                <EmptyState
                    title="No Centers Available"
                    subtitle="Centers will appear here once data is added"
                    onButtonPress={() => { }}
                />


            </View>

        </ScreenWrapper>

    )
}
export default CentersScreen;

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