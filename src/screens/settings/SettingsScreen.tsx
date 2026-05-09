import React from "react";
import { View, StyleSheet, Text, Pressable, Alert } from "react-native";
import { colors, spacing, typography, radius } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import { useAuth } from "../../hooks/useAuth";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";

type SettingsScreenNavigationProp = NativeStackNavigationProp<AppStackParamList, 'EditProfile'>;

const SettingsScreen = () => {
    const navigation = useNavigation<SettingsScreenNavigationProp>();
    const { logout } = useAuth();
    async function handleLogout() {
        try {
            await logout();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Logout failed';
            Alert.alert('Logout Error', message);
        }
    }

    return (
        <ScreenWrapper>
            <View style={Styles.container}>
                <Text style={Styles.title}>
                    Settings
                </Text>
                <Text style={Styles.subtitle}>
                    Manage your app preferences.
                </Text>
                <View style={Styles.optionsContainer}>
                    <Pressable
                        style={Styles.optionalRow}
                        onPress={() => navigation.navigate('EditProfile')}>
                        <Text style={Styles.optionText}>
                            Edit Profile
                        </Text>
                    </Pressable >
                    <Pressable style={Styles.optionalRow}>
                        <Text style={Styles.optionText}>
                            Notifications
                        </Text>


                    </Pressable>
                    <Pressable
                        onPress={handleLogout}
                        style={Styles.optionalRow}>
                        <Text style={[Styles.optionText, Styles.logoutText]}>

                            Logout
                        </Text>


                    </Pressable>
                </View>
            </View>
        </ScreenWrapper>
    )
}

export default SettingsScreen;

const Styles = StyleSheet.create({
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
    optionsContainer: {
        backgroundColor: colors.surface,
        borderRadius: radius.borderRadius,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    optionalRow: {
        paddingVertical: spacing.sm,
        borderBottomColor: colors.border,
    },
    optionText: {
        fontSize: typography.body,
        color: colors.text,
    },
    logoutText: {
        color: colors.error,
        fontWeight: 'bold',
    }
})