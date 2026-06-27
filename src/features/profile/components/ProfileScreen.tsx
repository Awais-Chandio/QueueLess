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
import { ProfileCompletionBar } from "../../../components/ui/ProfileCompletionBar";
import { CardFadeIn } from "../../../components/animations/CardFadeIn";
import { Camera, Settings, Activity, Mail, Phone, Calendar, CheckCircle2 } from "lucide-react-native";
import type { AppStackParamList } from "../../../navigation/types";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import { toastService } from "../../../services/toastService";

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'Admin', color: '#7C3AED', bg: '#7C3AED18' },
  staff: { label: 'Staff', color: '#0284C7', bg: '#0284C718' },
  client: { label: 'Client', color: '#059669', bg: '#05966918' },
  // Legacy alias
  patient: { label: 'Patient', color: '#059669', bg: '#05966918' },
};

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, role: authRole } = useAuth();
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

  // Role is read from the DB (via profileStore) — this is authoritative.
  // authRole (from useAuth) is also DB-sourced (verified on login/restore).
  // NOTE: Changing a user's role does NOT transfer their appointments.
  //       Appointments always belong to the user_id that created them.
  //       Staff and admin accounts should be separate accounts, never converted from client accounts.
  const userRole = profile?.role ?? authRole ?? 'client';
  const roleConfig = ROLE_LABELS[userRole] ?? ROLE_LABELS.client;

  // Profile completion
  const hasName = !!profile?.full_name;
  const hasEmail = !!(profile?.email || user?.email);
  const hasPhone = !!profile?.phone;
  const hasAvatar = !!profile?.avatar_url;

  const statItems = [
    { label: 'Total', value: stats?.total ?? 0, color: colors.primary, Icon: Calendar },
    { label: 'Completed', value: stats?.completed ?? 0, color: colors.success, Icon: CheckCircle2 },
    { label: 'Active', value: stats?.active ?? 0, color: colors.info, Icon: Activity },
  ];

  return (
    <ScreenWrapper scrollable onRefresh={loadData} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: 'bold' }}>Profile</Text>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={({ pressed }) => [
            styles.settingsBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Settings color={colors.textSecondary} size={scaleFont(20)} />
        </Pressable>
      </View>

      {/* Avatar + name section */}
      <CardFadeIn delay={0}>
        <View style={styles.profileHeader}>
          {/* Avatar with colored ring */}
          <Pressable onPress={handleAvatarUpload} style={[styles.avatarRingContainer, { borderColor: colors.primary + '60' }]}>
            <ProfileAvatar uri={profile?.avatar_url} size={100} iconSize={50} />
            <View style={[styles.cameraIcon, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Camera size={scaleFont(13)} color="#FFF" />
            </View>
          </Pressable>

          {isUploadingAvatar ? (
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.sm }}>
              Uploading image...
            </Text>
          ) : null}

          <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' }}>
            {profile?.full_name || 'Add your name'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.xs, textAlign: 'center' }}>
            {profile?.email || user?.email}
          </Text>

          {/* Role badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg, borderColor: roleConfig.color + '40', borderWidth: 1, marginTop: spacing.sm }]}>
            <Text style={{ color: roleConfig.color, fontSize: scaleFont(12), fontWeight: '700' }}>
              {roleConfig.label}
            </Text>
          </View>

          {/* Profile completion bar */}
          <View style={{ width: '80%', marginTop: spacing.md }}>
            <ProfileCompletionBar
              hasName={hasName}
              hasEmail={hasEmail}
              hasPhone={hasPhone}
              hasAvatar={hasAvatar}
            />
          </View>
        </View>
      </CardFadeIn>

      {/* Profile Preview card */}
      <CardFadeIn delay={60}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.md }}>
            Contact Info
          </Text>
          <View style={styles.previewRow}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.primary}12` }]}>
              <Mail color={colors.primary} size={scaleFont(16)} />
            </View>
            <Text style={{ color: colors.text, fontSize: typography.sizes.md, flex: 1 }}>
              {profile?.email || user?.email || 'No email'}
            </Text>
          </View>
          <View style={[styles.previewRow, { marginTop: spacing.md }]}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.success}12` }]}>
              <Phone color={colors.success} size={scaleFont(16)} />
            </View>
            <Text style={{ color: profile?.phone ? colors.text : colors.textSecondary, fontSize: typography.sizes.md, flex: 1 }}>
              {profile?.phone || 'No phone number'}
            </Text>
          </View>
        </Card>
      </CardFadeIn>

      {/* Stats card */}
      <CardFadeIn delay={120}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.primary}12` }]}>
              <Activity color={colors.primary} size={scaleFont(16)} />
            </View>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginLeft: spacing.sm }}>
              Account Statistics
            </Text>
          </View>
          <View style={styles.statsRow}>
            {statItems.map((item, idx) => {
              const Icon = item.Icon;
              return (
                <React.Fragment key={item.label}>
                  {idx > 0 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.statItem}>
                    <View style={[styles.statIconPill, { backgroundColor: item.color + '15' }]}>
                      <Icon size={scaleFont(16)} color={item.color} />
                    </View>
                    <Text style={{ color: item.color, fontSize: typography.sizes.xxl, fontWeight: '700', marginTop: scaleFont(4) }}>
                      {item.value}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: scaleFont(2) }}>
                      {item.label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </Card>
      </CardFadeIn>

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
  settingsBtn: {
    width: scaleFont(40),
    height: scaleFont(40),
    borderRadius: scaleFont(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: hp(3),
  },
  avatarRingContainer: {
    borderWidth: 3,
    borderRadius: scaleFont(60),
    padding: 3,
    position: 'relative',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: scaleFont(28),
    height: scaleFont(28),
    borderRadius: scaleFont(14),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: scaleFont(12),
    paddingVertical: scaleFont(4),
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  infoIconPill: {
    width: scaleFont(34),
    height: scaleFont(34),
    borderRadius: scaleFont(17),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIconPill: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: scaleFont(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '80%',
  },
});
