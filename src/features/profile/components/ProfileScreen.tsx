import React, { useEffect, useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../../hooks/useAuth";
import { useProfileStore } from "../../../store/profileStore";
import { useDashboardStats } from "../../home/hooks/useDashboardStats";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import AppButton from "../../../components/ui/AppButton";
import { User, Camera, Settings, Activity } from "lucide-react-native";
import type { AppStackParamList } from "../../../navigation/types";

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { profile, fetchProfile } = useProfileStore();
  const { data: stats, refetch: refetchStats } = useDashboardStats();
  const { colors, spacing, typography } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    if (user?.id) {
      await fetchProfile(user.id);
      await refetchStats();
    }
    setRefreshing(false);
  }, [user?.id, fetchProfile, refetchStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAvatarUpload = () => {
    // In a real app, use react-native-image-picker and upload to Supabase Storage
    console.log("Avatar upload triggered");
  };

  return (
    <ScreenWrapper scrollable onRefresh={loadData} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: 'bold' }}>Profile</Text>
        <Pressable onPress={() => navigation.navigate("Settings")}>
          <Settings color={colors.textSecondary} size={24} />
        </Pressable>
      </View>

      <View style={styles.profileHeader}>
        <Pressable onPress={handleAvatarUpload} style={[styles.avatarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {profile?.avatar_url ? (
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary }} />
          ) : (
            <User size={48} color={colors.textSecondary} />
          )}
          <View style={[styles.cameraIcon, { backgroundColor: colors.primary }]}>
            <Camera size={14} color="#FFF" />
          </View>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '700', marginTop: spacing.md }}>
          {profile?.full_name || 'Add your name'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.md, marginTop: 4 }}>
          {profile?.email || user?.email}
        </Text>
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Activity color={colors.primary} size={20} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginLeft: spacing.sm }}>
            Account Statistics
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={styles.statItem}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>{stats?.total || 0}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Total</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>{stats?.completed || 0}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Completed</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>{stats?.active || 0}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Active</Text>
          </View>
        </View>
      </Card>

      <AppButton 
        title="Edit Profile" 
        variant="outline" 
        onPress={() => navigation.navigate("EditProfile")} 
      />
    </ScreenWrapper>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: '100%',
  }
});
