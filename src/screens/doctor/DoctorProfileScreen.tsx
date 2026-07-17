import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Camera, ChevronLeft, ShieldAlert, User as UserIcon } from 'lucide-react-native';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import ProfileAvatar from '../../components/ui/ProfileAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';
import { doctorService } from '../../services/doctorService';
import { supabase } from '../../lib/supabase';
import { toastService } from '../../services/toastService';
import { Card } from '../../components/ui/Card';

const EDITABLE_FIELDS = ['bio', 'photo_url'] as const;

const DoctorProfileScreen = () => {
  const navigation = useNavigation();
  const { colors, spacing, typography, radius } = useTheme();
  const { doctorId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Doctor profile state
  const [doctor, setDoctor] = useState<any>(null);
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const fetchDoctorData = async () => {
    if (!doctorId) return;
    try {
      setLoading(true);
      const data = await doctorService.getDoctorById(doctorId);
      setDoctor(data);
      setBio(data.bio || '');
      setPhotoUrl(data.photo_url || null);
    } catch (err: any) {
      console.warn('Failed to load doctor details:', err);
      toastService.error('Failed to load doctor profile information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorData();
  }, [doctorId]);

  const handlePhotoUpload = async () => {
    if (!doctorId || uploading) return;

    let result;
    try {
      result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        selectionLimit: 1,
      });
    } catch (pickerError) {
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
      const publicUrl = await doctorService.uploadPhoto(doctorId, asset.base64, asset.type || 'image/jpeg');
      setPhotoUrl(publicUrl);
      toastService.success('Photo uploaded successfully! Save changes to apply.');
    } catch (err: any) {
      toastService.error(err.message || 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!doctorId) return;

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('doctors')
        .update({ bio, photo_url: photoUrl })
        .eq('id', doctorId);

      if (error) {
        if (error.message.includes('Only admin can change')) {
          Alert.alert('Not allowed', 'Only an admin can change that field.');
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      toastService.success('Profile updated successfully!');
      fetchDoctorData();
    } catch (err: any) {
      toastService.error(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  // Helper to render read only profile info row
  const renderReadOnlyRow = (label: string, value: string | number | null | undefined) => (
    <View style={[styles.infoRow, { borderColor: colors.border + '30' }]}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value || '—'}</Text>
    </View>
  );

  return (
    <ScreenWrapper scrollable>
      {/* Header */}
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={scaleFont(24)} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Doctor Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Profile Photo Card */}
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <View style={styles.avatarWrapper}>
          <ProfileAvatar
            uri={photoUrl}
            size={scaleFont(90)}
          />
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
              <Camera size={scaleFont(16)} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm }}>
          Tap the camera icon to upload a profile photo
        </Text>
      </View>

      {/* Editable Fields */}
      <Card variant="elevated" style={[styles.card, { marginBottom: spacing.lg }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.md }]}>
          Editable Profile Information
        </Text>
        
        <AppInput
          label="Professional Biography (Bio)"
          placeholder="Describe your qualifications, specialties, and clinical experience..."
          multiline
          value={bio}
          onChangeText={setBio}
        />

        <AppButton
          title="Save Changes"
          variant="primary"
          loading={saving}
          disabled={saving || uploading}
          onPress={handleSave}
        />
      </Card>

      {/* Read-Only Fields */}
      <Card variant="elevated" style={[styles.card, { marginBottom: spacing.lg }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <ShieldAlert size={scaleFont(16)} color={colors.warning} />
          <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: spacing.xs }]}>
            Restricted System Fields
          </Text>
        </View>
        
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.md }}>
          The following details are locked for security and auditing. Contact admin to update this.
        </Text>

        <View style={styles.infoGrid}>
          {renderReadOnlyRow('Full Name', doctor?.name)}
          {renderReadOnlyRow('Gender', doctor?.gender)}
          {renderReadOnlyRow('Specialty', doctor?.specialty)}
          {renderReadOnlyRow('Qualification', doctor?.qualification)}
          {renderReadOnlyRow('Experience Years', doctor?.experience_years != null ? `${doctor.experience_years} Years` : null)}
          {renderReadOnlyRow('License Number', doctor?.license_number)}
          {renderReadOnlyRow('Employee Code', doctor?.employee_code)}
          {renderReadOnlyRow('Consultation Fee', doctor?.fee != null ? `$${doctor.fee}` : null)}
          {renderReadOnlyRow('Status', doctor?.status)}
          {renderReadOnlyRow('Active Status', doctor?.is_active ? 'Active' : 'Inactive')}
        </View>
      </Card>
    </ScreenWrapper>
  );
};

export default DoctorProfileScreen;

const styles = StyleSheet.create({
  loadingContainer: {
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  avatarWrapper: {
    position: 'relative',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  card: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
