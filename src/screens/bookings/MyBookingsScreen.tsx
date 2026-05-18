import React, { useEffect } from "react";
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    useNavigation,
} from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import ScreenWrapper from "../../components/common/ScreenWrapper";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Loader from "../../components/common/Loader";
import { useAuthStore } from "../../store/authStore";
import { useBookingsStore } from "../../store/bookingsStore";
import type {
    AppStackParamList,
    AppTabParamList,
} from "../../navigation/types";
import type { Booking, BookingStatus } from "../../types/booking";

type NavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList, "MyBookings">,
    NativeStackNavigationProp<AppStackParamList>
>;

const getStatusColor = (status: BookingStatus) => {
    switch (status) {
        case "confirmed":
        case "completed":
            return colors.success;
        case "cancelled":
            return colors.error;
        case "pending":
        default:
            return colors.warning;
    }
};

const MyBookingsScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const user = useAuthStore(state => state.user);
    const bookings = useBookingsStore(state => state.bookings);
    const loading = useBookingsStore(state => state.loading);
    const error = useBookingsStore(state => state.error);
    const fetchUserBookings = useBookingsStore(
        state => state.fetchUserBookings,
    );

    useEffect(() => {
        if (user?.id) {
            fetchUserBookings(user.id);
        }
    }, [fetchUserBookings, user?.id]);

    const handleRetry = () => {
        if (user?.id) {
            fetchUserBookings(user.id);
        }
    };

    const renderBooking = ({ item }: { item: Booking }) => (
        <Pressable
            style={styles.card}
            onPress={() =>
                navigation.navigate("BookingDetails", {
                    bookingId: item.id,
                })
            }
            accessibilityRole="button">
            <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                    <Text style={styles.bookingTitle}>
                        Booking #{item.id.slice(0, 8)}
                    </Text>
                    <Text style={styles.serviceId}>
                        Service: {item.service_id}
                    </Text>
                </View>

                <Text
                    style={[
                        styles.status,
                        {
                            color: getStatusColor(item.status),
                        },
                    ]}>
                    {item.status}
                </Text>
            </View>

            <View style={styles.detailsRow}>
                <View style={styles.detail}>
                    <Text style={styles.label}>Date</Text>
                    <Text style={styles.value}>
                        {item.booking_date}
                    </Text>
                </View>

                <View style={styles.detail}>
                    <Text style={styles.label}>Time</Text>
                    <Text style={styles.value}>
                        {item.booking_time}
                    </Text>
                </View>
            </View>

            {item.queue_number !== null && (
                <Text style={styles.queue}>
                    Queue #{item.queue_number}
                </Text>
            )}
        </Pressable>
    );

    if (!user?.id) {
        return (
            <ScreenWrapper>
                <EmptyState
                    title="Login Required"
                    subtitle="Please login to view your bookings."
                />
            </ScreenWrapper>
        );
    }

    if (loading) {
        return (
            <ScreenWrapper>
                <View style={styles.center}>
                    <Loader />
                </View>
            </ScreenWrapper>
        );
    }

    if (error) {
        return (
            <ScreenWrapper>
                <ErrorState
                    title="Failed To Load Bookings"
                    message={error}
                    buttonTitle="Retry"
                    onRetry={handleRetry}
                />
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper>
            <FlatList
                data={bookings}
                keyExtractor={item => item.id}
                renderItem={renderBooking}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Text style={styles.title}>
                            My Bookings
                        </Text>
                        <Text style={styles.subtitle}>
                            Track your upcoming and past appointments.
                        </Text>
                    </View>
                }
                ListEmptyComponent={
                    <EmptyState
                        title="No Bookings Yet"
                        subtitle="Your bookings will appear here once you create one."
                        buttonTitle="Browse Centers"
                        onButtonPress={() =>
                            navigation.navigate("Centers")
                        }
                    />
                }
            />
        </ScreenWrapper>
    );
};

export default MyBookingsScreen;

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        paddingBottom: spacing.xl,
    },
    center: {
        alignItems: "center",
        flex: 1,
        justifyContent: "center",
    },
    header: {
        marginBottom: spacing.lg,
    },
    title: {
        color: colors.text,
        fontSize: typography.h1,
        fontWeight: "bold",
        marginBottom: spacing.xs,
    },
    subtitle: {
        color: colors.textSecondary,
        fontSize: typography.body,
    },
    card: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: spacing.md,
        padding: spacing.md,
    },
    cardHeader: {
        alignItems: "flex-start",
        flexDirection: "row",
        gap: spacing.md,
        justifyContent: "space-between",
        marginBottom: spacing.md,
    },
    cardTitleWrap: {
        flex: 1,
    },
    bookingTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontWeight: "bold",
    },
    serviceId: {
        color: colors.textSecondary,
        fontSize: typography.caption,
        marginTop: spacing.xs,
    },
    status: {
        fontSize: typography.small,
        fontWeight: "bold",
        textTransform: "capitalize",
    },
    detailsRow: {
        flexDirection: "row",
        gap: spacing.md,
    },
    detail: {
        flex: 1,
    },
    label: {
        color: colors.textSecondary,
        fontSize: typography.caption,
        marginBottom: spacing.xs,
    },
    value: {
        color: colors.text,
        fontSize: typography.small,
        fontWeight: "600",
    },
    queue: {
        color: colors.primary,
        fontSize: typography.small,
        fontWeight: "700",
        marginTop: spacing.md,
    },
});
