import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";

const ProfileScreen = () => {
    return (
        <ScreenWrapper>
            <View style={styles.container}>
                <Text style={styles.title}>
                    Profile
                </Text>
                <Text style={styles.subtitle}>
                    Your profile details will appear here
                </Text>
                <View style={styles.infoContainer}>
                     <Text style={styles.infoText}>Name : John Doe </Text>
                    <Text style={styles.infoText}>Email: john.doe@example.com</Text>
                    <Text style={styles.infoText}>Phone : Not Added</Text>
                </View>

            </View>

        </ScreenWrapper>
    )
}
export default ProfileScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: spacing.lg,
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
    infoContainer: {
        backgroundColor: colors.surface,
        borderRadius: spacing.sm,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    infoText: {
        fontSize: typography.body,
        color: colors.text,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
})