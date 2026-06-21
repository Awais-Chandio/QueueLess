import React, { useEffect, useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../../hooks/useAuth";
import { useProfileStore } from "../../../store/profileStore";
import { useDashboardStats } from "../../home/hooks/useDashboardStats";
import { useTheme } from "../../../hooks/useTheme";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import AppButton from "../../../components/ui/AppButton";
import ProfileAvatar from "../../../components/ui/ProfileAvatar";
import { Camera, Settings, Activity, Mail, Phone } from "lucide-react-native";
import type { AppStackParamList } from "../../../navigation/types";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import { toastService } from "../../../services/toastService";

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { profile, fetchProfile, uploadAvatar, isUploadingAvatar, error } = useProfileStore();
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

  const handleAvatarUpload = async () => {
    if (!user?.id || isUploadingAvatar) return;

    let result;

    try {
      result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        selectionLimit: 1,
      });
    } catch (error) {
      const message =
        error instanceof TypeError
          ? 'Image picker is not linked yet. Rebuild and reinstall the Android app.'
          : error instanceof Error
            ? error.message
            : 'Unable to open image picker';
      toastService.error(message);
      return;
    }

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      toastService.error(result.errorMessage);
      return;
    }

    const asset = result.assets?.[0];

    if (!asset?.uri) {
      toastService.error('Unable to read selected image');
      return;
    }

    if (__DEV__) {
      console.log('[ProfileScreen.handleAvatarUpload] image asset:', {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.type,
        hasBase64: Boolean(asset.base64),
      });
    }

    await uploadAvatar(user.id, {
      uri: asset.uri,
      fileName: asset.fileName,
      type: asset.type,
      base64: asset.base64,
    });

    const currentError = useProfileStore.getState().error;
    if (currentError) {
      toastService.error(currentError);
      return;
    }

    toastService.success('Profile image updated');
  };

  return (
    <ScreenWrapper scrollable onRefresh={loadData} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: 'bold' }}>Profile</Text>
        <Pressable onPress={() => navigation.navigate("Settings")}>
          <Settings color={colors.textSecondary} size={scaleFont(24)} />
        </Pressable>
      </View>

      <View style={styles.profileHeader}>
        <Pressable onPress={handleAvatarUpload} style={[styles.avatarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ProfileAvatar uri={profile?.avatar_url} size={96} iconSize={48} />
          <View style={[styles.cameraIcon, { backgroundColor: colors.primary }]}>
            <Camera size={scaleFont(14)} color="#FFF" />
          </View>
        </Pressable>
        {isUploadingAvatar ? (
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.sm }}>
            Uploading image...
          </Text>
        ) : null}
        <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '700', marginTop: spacing.md }}>
          {profile?.full_name || 'Add your name'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.md, marginTop: spacing.xs }}>
          {profile?.email || user?.email}
        </Text>
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.md }}>
          Profile Preview
        </Text>
        <View style={styles.previewRow}>
          <Mail color={colors.textSecondary} size={scaleFont(18)} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.md, marginLeft: spacing.sm }}>
            {profile?.email || user?.email || 'No email'}
          </Text>
        </View>
        <View style={[styles.previewRow, { marginTop: spacing.sm }]}>
          <Phone color={colors.textSecondary} size={scaleFont(18)} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.md, marginLeft: spacing.sm }}>
            {profile?.phone || 'No phone number'}
          </Text>
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Activity color={colors.primary} size={scaleFont(20)} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginLeft: spacing.sm }}>
            Account Statistics
          </Text>
        </View>
        <View style={styles.statsRow}>
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
      {error ? (
        <Text style={{ color: colors.error, fontSize: typography.sizes.sm, marginTop: spacing.sm, textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}
    </ScreenWrapper>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(3),
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: hp(4),
  },
  avatarContainer: {
    width: wp(26),
    maxWidth: scaleFont(112),
    minWidth: scaleFont(88),
    aspectRatio: 1,
    borderRadius: scaleFont(50),
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: scaleFont(14),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '100%',
  }
});
