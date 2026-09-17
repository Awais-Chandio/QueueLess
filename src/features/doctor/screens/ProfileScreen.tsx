import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { useAuth } from '../../../hooks/useAuth';
import { doctorService } from '../../../services/doctorService';
import { supabase } from '../../../lib/supabase';
import { toastService } from '../../../services/toastService';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { doctorSelfProfileSchema, type DoctorSelfProfileData } from '../../../validations/doctorProfileSchema';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  CreditCard,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Camera,
  LogOut,
} from 'lucide-react-native';

export default function ProfileScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { isLoading, doctorProfile } = useDoctorDashboard();
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
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
      setPhotoUrl(doctorProfile.photo_url || null);
    }
    // Re-seed only when the doctor identity changes, not on every background
    // refetch — otherwise an in-progress edit would get clobbered mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorProfile?.id]);

  const handlePhotoUpload = async () => {
    if (!doctorProfile?.id || uploading) return;

    let result;
    try {
      result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        selectionLimit: 1,
      });
    } catch {
      toastService.error('Unable to open image picker.');
      return;
    }

    if (result.didCancel || result.errorMessage || !result.assets?.[0]) {
      if (result.errorMessage) {
        toastService.error(result.errorMessage);
      }
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      toastService.error('Could not get image base64 data.');
      return;
    }

    try {
      setUploading(true);
      const publicUrl = await doctorService.uploadPhoto(doctorProfile.id, asset.base64, asset.type || 'image/jpeg');
      setPhotoUrl(publicUrl);
      toastService.success('Photo uploaded successfully! Save changes to apply.');
    } catch (err: any) {
      toastService.error(err.message || 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (values: DoctorSelfProfileData) => {
    if (!doctorProfile?.id) return;

    try {
      setSaving(true);

      // Only doctor-editable columns are sent; admin-only columns are never touched here.
      const { data: saved, error } = await supabase
        .from('doctors')
        .update({
          specialty: values.specialty.trim(),
          qualification: values.qualification.trim(),
          bio: values.bio.trim() || null,
          photo_url: photoUrl,
        })
        .eq('id', doctorProfile.id)
        .select('id')
        .maybeSingle();

      if (error) {
        if (error.message.includes('Only admin can change')) {
          Alert.alert('Not allowed', 'Only an admin can change that field.');
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      if (!saved) {
        Alert.alert('Not saved', 'Your profile could not be updated. Please sign in again and retry.');
        return;
      }

      toastService.success('Profile updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['doctor-profile'] });
    } catch (err: any) {
      toastService.error(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out from your Doctor Portal account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  if (isLoading && !doctorProfile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
    >
      {/* Profile Header Card */}
      <View style={[styles.profileHeaderCard, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        <View style={styles.avatarWrapper}>
          <View style={[styles.avatarContainer, { backgroundColor: colors.primary + '10' }]}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <User size={48} color={colors.primary} />
            )}
          </View>
          <Pressable
            onPress={handlePhotoUpload}
            disabled={uploading}
            style={({ pressed }) => [
              styles.cameraButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Camera size={16} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
        <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
          Dr. {doctorProfile?.name}
        </Text>
        <Text style={[styles.specialty, { color: colors.primary, fontSize: typography.sizes.xs }]}>
          {doctorProfile?.specialty || 'General Specialist'}
        </Text>
      </View>

      {/* Editable Profile Information */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
        Editable Profile Information
      </Text>
      <View style={[styles.infoBlock, styles.editableBlock, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
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
            />
          )}
        />
        <Controller
          name="qualification"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Qualification"
              placeholder="e.g. MBBS, FCPS"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.qualification?.message}
              required
              editable={!saving}
            />
          )}
        />
        <Controller
          name="bio"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Professional Biography (Bio)"
              placeholder="Describe your clinical experience and areas of focus..."
              multiline
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.bio?.message}
              maxLength={1000}
              editable={!saving}
            />
          )}
        />
        <AppButton
          title="Save Changes"
          variant="primary"
          loading={saving}
          disabled={saving || uploading}
          onPress={handleSubmit(handleSave)}
        />
      </View>

      {/* Restricted Fields Banner */}
      <View style={[styles.restrictedBanner, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30', borderRadius: radius.md }]}>
        <ShieldAlert size={16} color={colors.warning} />
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginLeft: 8, flex: 1 }}>
          The following details are locked for security and auditing. Contact admin to update them.
        </Text>
      </View>

      {/* Profile Info Details List */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
        Professional Information
      </Text>

      <View style={[styles.infoBlock, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        {/* Center */}
        <View style={styles.infoRow}>
          <MapPin size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              ASSIGNED CENTER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.center_name || 'Not Assigned'}
            </Text>
          </View>
        </View>

        {/* Experience */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <Briefcase size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              EXPERIENCE
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.experience_years} Years
            </Text>
          </View>
        </View>

        {/* License */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <ShieldCheck size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              LICENSE NUMBER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.license_number || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Consultation Fee */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <CreditCard size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              CONSULTATION FEE
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              Rs. {doctorProfile?.fee || 0}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm, marginTop: spacing.md }]}>
        Contact Information
      </Text>

      <View style={[styles.infoBlock, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        {/* Email */}
        <View style={styles.infoRow}>
          <Mail size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              EMAIL ADDRESS
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]} numberOfLines={1}>
              {doctorProfile?.email || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Phone */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <Phone size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              PHONE NUMBER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.phone || 'N/A'}
            </Text>
          </View>
        </View>
      </View>

      {/* Log Out Button */}
      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: colors.error + '10', borderColor: colors.error + '30', borderRadius: radius.xl }]}
        onPress={handleSignOut}
      >
        <LogOut size={18} color={colors.error} style={{ marginRight: spacing.sm }} />
        <Text style={[styles.logoutText, { color: colors.error, fontSize: typography.sizes.sm }]}>
          Sign Out Account
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderCard: {
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  editableBlock: {
    padding: 16,
    gap: 12,
  },
  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  name: {
    fontWeight: '800',
    marginBottom: 4,
  },
  specialty: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  bio: {
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  infoBlock: {
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoIcon: {
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 10,
  },
  logoutText: {
    fontWeight: '700',
  },
});
