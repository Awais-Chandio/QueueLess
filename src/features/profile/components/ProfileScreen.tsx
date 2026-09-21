import React, { useEffect, useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable, Switch, Alert } from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../../hooks/useAuth";
import { useProfileStore } from "../../../store/profileStore";
import { useDashboardStats } from "../../home/hooks/useDashboardStats";
import { useTheme } from "../../../hooks/useTheme";
import { useThemeStore } from "../../../store/themeStore";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import AppButton from "../../../components/ui/AppButton";
import ProfileAvatar from "../../../components/ui/ProfileAvatar";
import { ProfileCompletionBar } from "../../../components/ui/ProfileCompletionBar";
import AnimatedCard from "../../../components/ui/AnimatedCard";
import { Camera, Settings, Activity, Mail, Phone, Calendar, CheckCircle2, Moon, Shield, FileText, Info, ChevronRight, LogOut } from "lucide-react-native";
import LinearGradient from "react-native-linear-gradient";
import type { AppStackParamList } from "../../../navigation/types";
import { hp, scaleFont, wp } from "../../../utils/responsive";
import { toastService } from "../../../services/toastService";

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'Admin', color: '#0E7490', bg: '#0E749018' },
  staff: { label: 'Staff', color: '#0E7490', bg: '#0E749018' },
  client: { label: 'Client', color: '#0E7490', bg: '#0E749018' },
  patient: { label: 'Patient', color: '#0E7490', bg: '#0E749018' },
};

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, role: authRole, logout } = useAuth();
  const { profile, fetchProfile, uploadAvatar, isUploadingAvatar, error } = useProfileStore();
  const { data: stats, refetch: refetchStats } = useDashboardStats();
  const { colors, spacing, typography } = useTheme();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const [refreshing, setRefreshing] = useState(false);
  const [showMedicalHistory, setShowMedicalHistory] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (logoutErr) {
      Alert.alert('Logout Error', logoutErr instanceof Error ? logoutErr.message : 'Logout failed');
    }
  };

  const SettingRow = ({ title, icon: Icon, rightElement, onPress, color, isLast }: any) => {
    const iconColor = color || colors.primary;
    return (
      <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [
        styles.settingRow, 
        !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { backgroundColor: colors.background }
      ]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
            <Icon size={scaleFont(20)} color={iconColor} />
          </View>
          <Text style={{ color: colors.text, fontSize: typography.sizes.md, marginLeft: spacing.md, fontWeight: '500' }}>
            {title}
          </Text>
        </View>
        <View style={styles.settingRight}>
          {rightElement || <ChevronRight size={scaleFont(20)} color={colors.textSecondary} />}
        </View>
      </Pressable>
    );
  };

  const loadData = useCallback(async (force = false) => {
    setRefreshing(true);
    if (user?.id) {
      const currentProfile = useProfileStore.getState().profile;
      if (force || !currentProfile || currentProfile.id !== user.id) {
        await fetchProfile(user.id);
      }
      await refetchStats();
    }
    setRefreshing(false);
  }, [user?.id, fetchProfile, refetchStats]);

  useEffect(() => {
    loadData(false);
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

  const userRole = profile?.role ?? authRole ?? 'client';
  const roleConfig = ROLE_LABELS[userRole] ?? ROLE_LABELS.client;

  const hasName = !!profile?.full_name;
  const hasEmail = !!(profile?.email || user?.email);
  const hasPhone = !!profile?.phone;
  const hasAvatar = !!profile?.avatar_url;

  const statItems = [
    { label: 'Total', value: stats?.total ?? 0, color: colors.primary, Icon: Calendar },
    { label: 'Completed', value: stats?.completed ?? 0, color: colors.primary, Icon: CheckCircle2 },
    { label: 'Active', value: stats?.active ?? 0, color: colors.info, Icon: Activity },
  ];

  return (
    <ScreenWrapper scrollable onRefresh={() => loadData(true)} refreshing={refreshing}>
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800', letterSpacing: 0.3 }}>Profile</Text>
      </View>

      {/* Avatar + name section */}
      <AnimatedCard delay={0}>
        <View style={styles.profileHeader}>
          {/* Avatar with gradient outline */}
          <Pressable onPress={handleAvatarUpload} style={{ position: 'relative', marginBottom: spacing.sm }}>
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: scaleFont(108),
                height: scaleFont(108),
                borderRadius: scaleFont(54),
                justifyContent: 'center',
                alignItems: 'center',
                padding: 3,
              }}
            >
              <View style={{
                backgroundColor: colors.background,
                borderRadius: scaleFont(51),
                width: scaleFont(102),
                height: scaleFont(102),
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <ProfileAvatar uri={profile?.avatar_url} size={scaleFont(96)} iconSize={scaleFont(48)} />
              </View>
            </LinearGradient>
            <View style={[styles.cameraIcon, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Camera size={scaleFont(12)} color="#FFF" />
            </View>
          </Pressable>

          {isUploadingAvatar ? (
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.sm }}>
              Uploading image...
            </Text>
          ) : null}

          <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' }}>
            {profile?.full_name || 'Add your name'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.xs, textAlign: 'center' }}>
            {profile?.email || user?.email}
          </Text>

          {/* Role badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg, borderColor: roleConfig.color + '40', borderWidth: 1, marginTop: spacing.sm }]}>
            <Text style={{ color: roleConfig.color, fontSize: scaleFont(11), fontWeight: '800', textTransform: 'uppercase' }}>
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
      </AnimatedCard>

      {/* Profile Preview card */}
      <AnimatedCard delay={60}>
        <Card style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 20 }}>
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '800', marginBottom: spacing.md }}>
            Contact Info
          </Text>
          <View style={styles.previewRow}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.primary}12` }]}>
              <Mail color={colors.primary} size={scaleFont(16)} />
            </View>
            <Text style={{ color: colors.text, fontSize: typography.sizes.md, flex: 1, fontWeight: '600' }}>
              {profile?.email || user?.email || 'No email'}
            </Text>
          </View>
          <View style={[styles.previewRow, { marginTop: spacing.md }]}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.primary}12` }]}>
              <Phone color={colors.primary} size={scaleFont(16)} />
            </View>
            <Text style={{ color: profile?.phone ? colors.text : colors.textSecondary, fontSize: typography.sizes.md, flex: 1, fontWeight: '600' }}>
              {profile?.phone || 'No phone number'}
            </Text>
          </View>
        </Card>
      </AnimatedCard>

      {/* Stats card */}
      <AnimatedCard delay={120}>
        <Card style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={[styles.infoIconPill, { backgroundColor: `${colors.primary}12` }]}>
              <Activity color={colors.primary} size={scaleFont(16)} />
            </View>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '800', marginLeft: spacing.sm }}>
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
                    <View style={[styles.statIconPill, { backgroundColor: item.color + '12' }]}>
                      <Icon size={scaleFont(16)} color={item.color} />
                    </View>
                    <Text style={{ color: item.color, fontSize: typography.sizes.xxl, fontWeight: '800', marginTop: scaleFont(4) }}>
                      {item.value}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: scaleFont(2), fontWeight: '700' }}>
                      {item.label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </Card>
      </AnimatedCard>

      {/* Medical History Section */}
      <AnimatedCard delay={180}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
          Health Records
        </Text>
        <Card style={{ padding: 0, marginBottom: spacing.lg, overflow: 'hidden', borderRadius: 20 }}>
          <SettingRow 
            title="Medical History"
            icon={FileText}
            color={colors.primary}
            onPress={() => setShowMedicalHistory(!showMedicalHistory)}
            isLast={!showMedicalHistory}
            rightElement={
              <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>
                {showMedicalHistory ? 'Hide' : 'View'}
              </Text>
            }
          />
          {showMedicalHistory && (
            <View style={{ padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border + '50' }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                Previous Prescriptions
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.md, lineHeight: 16 }}>
                • Amoxicillin 500mg (1 Capsule three times daily for 5 days){'\n'}
                • Panadol 500mg (1 Tablet as needed for fever/pain)
              </Text>

              <Text style={{ color: colors.text, fontWeight: '800', fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                Doctor Notes
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, lineHeight: 16 }}>
                • Patient is advised to monitor blood pressure daily.{'\n'}
                • Follow-up consultation scheduled in 2 weeks.
              </Text>
            </View>
          )}
        </Card>
      </AnimatedCard>

      {/* Preferences Grouped Card */}
      <AnimatedCard delay={240}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
          Preferences
        </Text>
        <Card style={{ padding: 0, marginBottom: spacing.lg, overflow: 'hidden', borderRadius: 20 }}>
          <SettingRow 
            title="Edit Profile"
            icon={Settings}
            color={colors.primary}
            onPress={() => navigation.navigate("EditProfile")}
          />
          <SettingRow 
            title="Dark Mode" 
            icon={Moon} 
            color={colors.info}
            isLast
            rightElement={
              <Switch 
                value={isDarkMode} 
                onValueChange={toggleTheme} 
                trackColor={{ false: colors.border, true: colors.primary }} 
                thumbColor={isDarkMode ? colors.card : '#f4f3f4'}
              />
            } 
          />
        </Card>
      </AnimatedCard>

      {/* Support & Legal Grouped Card */}
      <AnimatedCard delay={300}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
          Support & Legal
        </Text>
        <Card style={{ padding: 0, marginBottom: spacing.xl, overflow: 'hidden', borderRadius: 20 }}>
          <SettingRow title="Privacy Policy" icon={Shield} color={colors.success} onPress={() => navigation.navigate("PrivacyPolicy")} />
          <SettingRow title="Terms & Conditions" icon={FileText} color={colors.primary} onPress={() => navigation.navigate("Terms")} />
          <SettingRow title="About QueueLess" icon={Info} color={colors.textSecondary} isLast onPress={() => navigation.navigate("About")} />
        </Card>
      </AnimatedCard>

      {/* Logout button */}
      <AnimatedCard delay={360}>
        <AppButton 
          title="Logout" 
          variant="danger" 
          onPress={handleLogout} 
          style={{ borderRadius: 12 }}
          containerStyle={{ marginBottom: spacing.xl }}
          leftIcon={<LogOut size={16} color="#FFF" />}
        />
      </AnimatedCard>

      {error ? (
        <Text style={{ color: colors.error, fontSize: typography.sizes.sm, marginTop: spacing.sm, textAlign: 'center', fontWeight: '600' }}>
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
    borderWidth: 2,
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
    borderRadius: 8,
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: '80%',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.8),
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: scaleFont(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRight: {
    alignItems: 'flex-end',
  },
});
