import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  BadgeCheck,
  Briefcase,
  Camera,
  Coffee,
  CreditCard,
  Hash,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { doctorService } from '../../../services/doctorService';
import { toastService } from '../../../services/toastService';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { doctorSelfProfileSchema, type DoctorSelfProfileData } from '../../../validations/doctorProfileSchema';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import { doctorDisplayName } from '../utils/doctorFormat';

type ReadOnlyRow = { icon: LucideIcon; label: string; value: string };

/**
 * Doctor profile.
 *
 * The database decides what a doctor may change about themselves: specialty,
 * qualification, bio, photo and break status. Name, gender, experience,
 * employee code, license, fee, status and center are reverted by
 * protect_doctor_admin_fields_trigger, so they are shown in a separate locked
 * section instead of as fields whose edits would silently disappear.
 */
export default function ProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isLoading, error, doctorProfile, refresh } = useDoctorDashboard();
  const { isOnBreak, isTogglingBreak, toggleBreakMode } = useDoctorAvailability();
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DoctorSelfProfileData>({
    resolver: zodResolver(doctorSelfProfileSchema),
    defaultValues: { specialty: '', qualification: '', bio: '' },
  });

  useEffect(() => {
    if (doctorProfile) {
      reset({
        specialty: doctorProfile.specialty || '',
        qualification: doctorProfile.qualification || '',
        bio: doctorProfile.bio || '',
      });
    }
    // Re-seed only when the doctor identity changes so a background refetch
    // never overwrites an edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorProfile?.id]);

  const invalidateProfile = () => {
    queryClient.invalidateQueries({ queryKey: ['doctor-profile'] });
    queryClient.invalidateQueries({ queryKey: ['doctor-profile-availability'] });
  };

  const handlePhotoUpload = async () => {
    if (!doctorProfile?.id || uploading) return;

    const result = await launchImageLibrary({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
      selectionLimit: 1,
    }).catch(() => null);

    if (!result || result.didCancel) return;
    const asset = result.assets?.[0];
    if (result.errorMessage || !asset?.base64) {
      toastService.error('Could not read that photo.', result.errorMessage);
      return;
    }

    try {
      setUploading(true);
      const publicUrl = await doctorService.uploadPhoto(doctorProfile.id, asset.base64, asset.type || 'image/jpeg');
      // Save immediately. The old flow uploaded the file and then waited for a
      // separate "Save Changes" tap, so leaving the screen lost the new photo.
      const { error: saveError } = await supabase
        .from('doctors')
        .update({ photo_url: publicUrl })
        .eq('id', doctorProfile.id);
      if (saveError) throw saveError;
      invalidateProfile();
      toastService.success('Profile photo updated.');
    } catch (err) {
      toastService.error('Could not update your photo.', err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (values: DoctorSelfProfileData) => {
    if (!doctorProfile?.id) return;
    try {
      setSaving(true);
      const { data: saved, error: saveError } = await supabase
        .from('doctors')
        .update({
          specialty: values.specialty.trim(),
          qualification: values.qualification.trim(),
          bio: values.bio.trim() || null,
        })
        .eq('id', doctorProfile.id)
        .select('specialty, qualification, bio')
        .maybeSingle();

      if (saveError) throw saveError;
      if (!saved) {
        toastService.error('Profile not saved.', 'Please sign in again and retry.');
        return;
      }

      reset({ specialty: saved.specialty ?? '', qualification: saved.qualification ?? '', bio: saved.bio ?? '' });
      invalidateProfile();
      toastService.success('Profile updated.');
    } catch (err) {
      toastService.error('Could not save your profile.', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleBreak = async (value: boolean) => {
    try {
      await toggleBreakMode(value);
      toastService.success(value ? 'You are on a break.' : 'You are active again.');
    } catch (err) {
      toastService.error('Could not update break status.', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to manage your queue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  if (error && !doctorProfile) {
    return (
      <ScreenWrapper edges={['top']}>
        <ErrorState title="Couldn't load your profile" message={error} onRetry={refresh} />
      </ScreenWrapper>
    );
  }

  if (isLoading || !doctorProfile) {
    return (
      <ScreenWrapper edges={['top']}>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={180} borderRadius={radius.card} />
          <Skeleton height={72} borderRadius={radius.card} />
          <Skeleton height={320} borderRadius={radius.card} />
        </View>
      </ScreenWrapper>
    );
  }

  const status = (doctorProfile.status || (doctorProfile.is_active ? 'active' : 'inactive')).toLowerCase();

  const adminRows: ReadOnlyRow[] = [
    { icon: MapPin, label: 'Center', value: doctorProfile.center_name || 'Not assigned' },
    { icon: Hash, label: 'Employee code', value: doctorProfile.employee_code || '—' },
    { icon: ShieldCheck, label: 'License number', value: doctorProfile.license_number || '—' },
    {
      icon: CreditCard,
      label: 'Consultation fee',
      value: doctorProfile.fee != null ? `Rs. ${Number(doctorProfile.fee).toLocaleString()}` : '—',
    },
    { icon: Briefcase, label: 'Experience', value: `${doctorProfile.experience_years ?? 0} years` },
    { icon: User, label: 'Gender', value: doctorProfile.gender || '—' },
  ];

  return (
    <ScreenWrapper scrollable edges={['top']}>
      {/* Identity */}
      <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg, alignItems: 'center' }}>
        <Pressable
          onPress={handlePhotoUpload}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          style={styles.avatarWrap}
        >
          <View style={[styles.avatar, { backgroundColor: colors.tint.primary }]}>
            {doctorProfile.photo_url ? (
              <Image source={{ uri: doctorProfile.photo_url }} style={styles.avatarImage} />
            ) : (
              <User size={44} color={colors.primary} />
            )}
          </View>
          <View style={[styles.camera, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Camera size={15} color={colors.onPrimary} />
            )}
          </View>
        </Pressable>
        <AppText variant="heading" align="center" style={{ marginTop: spacing.md }}>
          {doctorDisplayName(doctorProfile.name)}
        </AppText>
        <AppText variant="label" tone="brand" weight="600" align="center">
          {doctorProfile.specialty || 'General practice'}
        </AppText>
        <View style={[styles.chips, { marginTop: spacing.sm, gap: spacing.xs }]}>
          <StatusChip
            status={status === 'active' ? 'success' : 'default'}
            label={status === 'active' ? 'Active' : status.charAt(0).toUpperCase() + status.slice(1)}
          />
          {isOnBreak ? <StatusChip status="doctor_on_break" label="On break" /> : null}
        </View>
      </Card>

      {/* Break status: doctor-editable */}
      <Card variant="outlined" padding="md" style={{ marginBottom: spacing.lg }}>
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: isOnBreak ? colors.tint.warning : colors.tint.success, borderRadius: radius.pill }]}>
            <Coffee size={18} color={isOnBreak ? colors.warning : colors.success} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Break status</AppText>
            <AppText variant="caption" tone="secondary">
              {isOnBreak ? 'Shown as on break in your queue' : 'Shown as seeing patients'}
            </AppText>
          </View>
          {isTogglingBreak ? <ActivityIndicator color={colors.primary} style={{ marginRight: spacing.sm }} /> : null}
          <Switch
            value={isOnBreak}
            onValueChange={handleBreak}
            disabled={isTogglingBreak}
            trackColor={{ false: colors.border, true: colors.warning }}
            thumbColor={colors.surface}
            accessibilityLabel="Break status"
          />
        </View>
      </Card>

      {/* Professional details: doctor-editable */}
      <AppText variant="subtitle" style={{ marginBottom: spacing.xs }}>
        Your professional details
      </AppText>
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
        Shown to patients when they choose a doctor.
      </AppText>
      <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
        <Controller
          name="specialty"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Specialty"
              placeholder="e.g. Cardiology"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.specialty?.message}
              required
              editable={!saving}
              maxLength={100}
            />
          )}
        />
        <Controller
          name="qualification"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Qualification"
              placeholder="e.g. MBBS, FCPS (Medicine)"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.qualification?.message}
              required
              editable={!saving}
              maxLength={150}
            />
          )}
        />
        <Controller
          name="bio"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="About you"
              placeholder="Your clinical experience and areas of focus"
              multiline
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.bio?.message}
              helperText={`${value.length}/1000`}
              maxLength={1000}
              editable={!saving}
            />
          )}
        />
        <AppButton
          title={isDirty ? 'Save changes' : 'No changes to save'}
          loading={saving}
          disabled={!isDirty || saving || uploading}
          onPress={handleSubmit(handleSave)}
        />
      </Card>

      {/* Admin-managed: read-only */}
      <View style={[styles.row, { marginBottom: spacing.xs }]}>
        <Lock size={16} color={colors.textSecondary} />
        <AppText variant="subtitle" style={{ marginLeft: spacing.xs }}>
          Managed by your clinic
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
        Only an administrator can change these. Contact your clinic admin if something is wrong.
      </AppText>
      <Card variant="flat" padding="none" style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
        {adminRows.map((row, index) => {
          const Icon = row.icon;
          return (
            <View
              key={row.label}
              accessibilityLabel={`${row.label}: ${row.value}. Read only.`}
              style={[
                styles.row,
                {
                  paddingVertical: spacing.md,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.divider,
                },
              ]}
            >
              <Icon size={18} color={colors.textTertiary} style={{ marginRight: spacing.md }} />
              <View style={styles.flex}>
                <AppText variant="caption" tone="tertiary">
                  {row.label}
                </AppText>
                <AppText variant="bodyStrong" tone="secondary">
                  {row.value}
                </AppText>
              </View>
              <Lock size={14} color={colors.textTertiary} />
            </View>
          );
        })}
      </Card>

      {/* Contact */}
      <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
        Account
      </AppText>
      <Card variant="outlined" padding="none" style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
        {[
          { icon: Mail, label: 'Sign-in email', value: doctorProfile.email || '—' },
          { icon: Phone, label: 'Phone', value: doctorProfile.phone || 'Not added' },
          { icon: BadgeCheck, label: 'Role', value: 'Doctor' },
        ].map((row, index) => {
          const Icon = row.icon;
          return (
            <View
              key={row.label}
              style={[
                styles.row,
                {
                  paddingVertical: spacing.md,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.divider,
                },
              ]}
            >
              <Icon size={18} color={colors.primary} style={{ marginRight: spacing.md }} />
              <View style={styles.flex}>
                <AppText variant="caption" tone="secondary">
                  {row.label}
                </AppText>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {row.value}
                </AppText>
              </View>
            </View>
          );
        })}
      </Card>

      <AppButton
        title="Sign out"
        variant="outline"
        leftIcon={<LogOut size={18} color={colors.error} />}
        textStyle={{ color: colors.error }}
        onPress={handleSignOut}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarWrap: {
    alignSelf: 'center',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 96,
    height: 96,
  },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
