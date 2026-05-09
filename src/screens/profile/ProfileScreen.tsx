import React, { useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useProfileStore } from "../../store/profileStore";
import { View, StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import AppButton from "../../components/common/AppButton";
import type { AppStackParamList } from "../../navigation/types";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Loader from "../../components/common/Loader";

type NavigationProp = NativeStackNavigationProp<AppStackParamList, "EditProfile">;

const ProfileScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const { user } = useAuth();
    const { profile, fetchProfile, isLoading, error } = useProfileStore();

    useEffect(() => {
        console.log('[ProfileScreen] user?.id =', user?.id);
        if (user?.id) {
            console.log('[ProfileScreen] calling fetchProfile for userId:', user.id);
            fetchProfile(user.id);
        }
    }, [user?.id, fetchProfile]);
    if (isLoading) {
        return (
            <ScreenWrapper>
                <Loader />
            </ScreenWrapper>
        );
    }
    if (error) {

        return (
            <ScreenWrapper>
                <ErrorState
                    message={error}
                    buttonTitle="Retry"
                    onRetry={() => user?.id && fetchProfile(user.id)}
                />
            </ScreenWrapper>
        );
    }
    if (!profile) {
        return (
            <ScreenWrapper>
                <EmptyState
                    title="No Profile Data"
                    subtitle="Your profile information could not be loaded."
                    buttonTitle="Retry"
                    onButtonPress={() => user?.id && fetchProfile(user.id)}
                />
            </ScreenWrapper>
        );
    }



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
                    <Text style={styles.infoText}>
                        Name: {profile.full_name || 'Not Added'}
                    </Text>

                    <Text style={styles.infoText}>
                        Email: {profile.email || user?.email || 'Not Added'}
                    </Text>

                    <Text style={styles.infoText}>
                        Phone: {profile.phone || 'Not Added'}
                    </Text>
                </View>
                <AppButton
                    title="Edit Profile"
                    onPress={() => navigation.navigate("EditProfile")}
                />

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
        marginBottom: spacing.lg,
    },
    infoText: {
        fontSize: typography.body,
        color: colors.text,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
})
