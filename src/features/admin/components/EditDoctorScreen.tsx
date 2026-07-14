import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Camera, Stethoscope, Check } from 'lucide-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { centerService } from '../../../services/centerService';
import { doctorService } from '../../../services/doctorService';
import { toastService } from '../../../services/toastService';
import { hp, wp, scaleFont } from '../../../utils/responsive';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';

type EditDoctorScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'EditDoctor'>;
type EditDoctorScreenRouteProp = RouteProp<AdminStackParamList, 'EditDoctor'>;

const EditDoctorScreen = () => {
  const navigation = useNavigation<EditDoctorScreenNavigationProp>();
  const route = useRoute<EditDoctorScreenRouteProp>();
  const { doctorId } = route.params;
  const { colors, spacing, typography, radius } = useTheme();

  // Load state
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [fee, setFee] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);

  // Avatar state
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string>('image/jpeg');

  // Directory lists
  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [loadingCenters, setLoadingCenters] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 1. Fetch Centers & Doctor data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true);
      setLoadingCenters(true);
      try {
        // Load clinics first
        const clinicsData = await centerService.getCenters();
        const sortedClinics = [...(clinicsData || [])].sort((a, b) => a.name.localeCompare(b.name));
        setCenters(sortedClinics);

        // Load doctor details
        const doc = await doctorService.getDoctorById(doctorId);
        if (doc) {
          setName(doc.name || '');
          setEmail(doc.profiles?.email || '');
          setPhone(doc.profiles?.phone || '');
          setGender(doc.gender || 'Male');
          setQualification(doc.qualification || '');
          setExperience(doc.experience_years ? String(doc.experience_years) : '0');
          setLicenseNumber(doc.license_number || '');
          setEmployeeCode(doc.employee_code || '');
          setFee(doc.fee ? String(doc.fee) : '0');
          setSelectedCenterId(doc.center_id || null);
          setProfileId(doc.profile_id || null);
          setExistingPhotoUrl(doc.photo_url || null);
          setAvatarUri(doc.photo_url || null);
          setIsActive(doc.status === 'active' || doc.is_active);

          // Map selected services
          if (doc.doctor_services) {
            const mappedIds = doc.doctor_services.map((ds: any) => ds.service_id).filter(Boolean);
            setSelectedServiceIds(mappedIds);
          }
        }
      } catch (err: any) {
        console.warn('Failed to load doctor profile:', err);
        toastService.error('Failed to retrieve doctor profile details.');
      } finally {
        setLoadingCenters(false);
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, [doctorId]);

  // 2. Fetch Services when Center changes (but check if center is different from original before wiping services selection)
  useEffect(() => {
    if (!selectedCenterId) {
      setServices([]);
      return;
    }

    const loadServices = async () => {
      setLoadingServices(true);
      try {
        const data = await centerService.getCenterServices(selectedCenterId);
        const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
        setServices(sorted);
      } catch (err) {
        console.warn('Failed to load center services:', err);
        toastService.error('Failed to load clinic departments.');
      } finally {
        setLoadingServices(false);
      }
    };
    loadServices();
  }, [selectedCenterId]);

  const handleSelectAvatar = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorMessage) {
        toastService.error(result.errorMessage);
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        setAvatarUri(asset.uri);
        setAvatarBase64(asset.base64 || null);
        setAvatarMimeType(asset.type || 'image/jpeg');
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      toastService.error('Failed to open photo library.');
    }
  };

  const toggleServiceSelection = (serviceId: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = 'Full name is required';
    if (!phone.trim()) errors.phone = 'Phone number is required';
    if (!qualification.trim()) errors.qualification = 'Qualification is required';
    
    if (!experience.trim()) {
      errors.experience = 'Experience is required';
    } else if (isNaN(Number(experience)) || Number(experience) < 0) {
      errors.experience = 'Experience must be a positive integer';
    }

    if (!licenseNumber.trim()) errors.licenseNumber = 'License number is required';
    if (!employeeCode.trim()) errors.employeeCode = 'Employee code is required';

    if (!fee.trim()) {
      errors.fee = 'Consultation fee is required';
    } else if (isNaN(Number(fee)) || Number(fee) < 0) {
      errors.fee = 'Fee must be a positive number';
    }

    if (!selectedCenterId) errors.center = 'Assigned clinic is required';
    if (selectedServiceIds.length === 0) errors.services = 'Select at least one department service';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toastService.error('Please fix validation errors.');
      return;
    }

    setIsSaving(true);
    try {
      await doctorService.updateDoctor(doctorId, {
        name: name.trim(),
        phone: phone.trim(),
        gender,
        qualification: qualification.trim(),
        experienceYears: parseInt(experience.trim(), 10),
        licenseNumber: licenseNumber.trim(),
        fee: parseFloat(fee.trim()),
        centerId: selectedCenterId!,
        serviceIds: selectedServiceIds,
        status: isActive ? 'active' : 'inactive',
        avatarBase64: avatarBase64,
        avatarMimeType: avatarMimeType,
        profileId: profileId,
        photoUrl: existingPhotoUrl,
      });

      toastService.success('Doctor profile updated successfully!');
      navigation.goBack();
    } catch (err: any) {
      toastService.error(err.message || 'Failed to update doctor.');
    } finally {
      setIsSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: spacing.md, fontSize: typography.sizes.sm }}>
            Loading doctor profile...
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { padding: spacing.md }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ChevronLeft size={24} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
                Back
              </Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
              Edit Doctor Profile
            </Text>
          </View>

          {/* Form Card */}
          <Card style={[styles.formCard, { padding: spacing.md, borderRadius: radius.xl }]}>
            
            {/* Avatar Selector */}
            <View style={styles.avatarSection}>
              <Pressable onPress={handleSelectAvatar} style={styles.avatarPressable}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={[styles.avatar, { borderRadius: radius.full }]} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '12', borderRadius: radius.full }]}>
                    <Stethoscope size={40} color={colors.primary} />
                  </View>
                )}
                <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderRadius: radius.full }]}>
                  <Camera size={14} color="#FFF" />
                </View>
              </Pressable>
              <Text style={[styles.avatarTip, { color: colors.textSecondary, fontSize: typography.caption, marginTop: spacing.xs }]}>
                Tap to change photo
              </Text>
            </View>

            {/* Read-only Auth Info */}
            <AppInput
              label="Email Address (Login ID - Read Only)"
              value={email}
              onChangeText={() => {}}
              editable={false}
            />

            <AppInput
              label="Employee Code (Read Only)"
              value={employeeCode}
              onChangeText={() => {}}
              editable={false}
            />

            {/* Editable Info */}
            <AppInput
              label="Full Name"
              placeholder="e.g. Dr. John Doe"
              value={name}
              onChangeText={setName}
              error={formErrors.name}
              editable={!isSaving}
            />

            <AppInput
              label="Phone Number"
              placeholder="e.g. 03001234567"
              value={phone}
              onChangeText={setPhone}
              error={formErrors.phone}
              keyboardType="phone-pad"
              editable={!isSaving}
            />

            {/* Gender Selection */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text, fontSize: typography.sizes.sm }]}>Gender</Text>
              <View style={styles.segmentContainer}>
                {['Male', 'Female', 'Other'].map(g => {
                  const isSel = gender === g;
                  return (
                    <Pressable
                      key={g}
                      onPress={() => setGender(g)}
                      style={[
                        styles.segmentButton,
                        {
                          borderColor: isSel ? colors.primary : colors.border,
                          backgroundColor: isSel ? colors.primary + '10' : colors.surface,
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      <Text style={[styles.segmentText, { color: isSel ? colors.primary : colors.textSecondary, fontSize: typography.sizes.xs }]}>
                        {g}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <AppInput
              label="Qualification"
              placeholder="e.g. MBBS, FCPS"
              value={qualification}
              onChangeText={setQualification}
              error={formErrors.qualification}
              editable={!isSaving}
            />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <AppInput
                  label="Experience (Years)"
                  placeholder="e.g. 5"
                  value={experience}
                  onChangeText={setExperience}
                  error={formErrors.experience}
                  keyboardType="numeric"
                  editable={!isSaving}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <AppInput
                  label="License Number"
                  placeholder="e.g. PMDC-12345"
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                  error={formErrors.licenseNumber}
                  editable={!isSaving}
                />
              </View>
            </View>

            <AppInput
              label="Consultation Fee"
              placeholder="Fee in PKR"
              value={fee}
              onChangeText={setFee}
              error={formErrors.fee}
              keyboardType="numeric"
              editable={!isSaving}
            />

            {/* Clinics Dropdown Selection */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text, fontSize: typography.sizes.sm }]}>
                Assign Service Clinic / Center
              </Text>
              {loadingCenters ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : centers.length === 0 ? (
                <Text style={{ color: colors.error, fontSize: typography.caption }}>No clinics configured.</Text>
              ) : (
                <View style={styles.centerList}>
                  {centers.map(center => {
                    const isSel = selectedCenterId === center.id;
                    return (
                      <Pressable
                        key={center.id}
                        onPress={() => setSelectedCenterId(center.id)}
                        style={[
                          styles.selectionItem,
                          {
                            borderColor: isSel ? colors.primary : colors.border,
                            backgroundColor: isSel ? colors.primary + '08' : colors.surface,
                            borderRadius: radius.md,
                            padding: spacing.md,
                          },
                        ]}
                      >
                        <Text style={[styles.selectionText, { color: isSel ? colors.primary : colors.text, fontWeight: isSel ? '700' : '500' }]}>
                          {center.name}
                        </Text>
                        {isSel && <Check size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {formErrors.center && (
                <Text style={[styles.errorText, { color: colors.error, fontSize: typography.caption }]}>{formErrors.center}</Text>
              )}
            </View>

            {/* Multi-select Services */}
            {selectedCenterId && (
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text, fontSize: typography.sizes.sm }]}>
                  Assign Services / Departments
                </Text>
                {loadingServices ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.sm }} />
                ) : services.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: typography.caption }}>
                    No services available for this clinic.
                  </Text>
                ) : (
                  <View style={styles.servicesGrid}>
                    {services.map(srv => {
                      const isSel = selectedServiceIds.includes(srv.id);
                      return (
                        <Pressable
                          key={srv.id}
                          onPress={() => toggleServiceSelection(srv.id)}
                          style={[
                            styles.serviceChip,
                            {
                              borderColor: isSel ? colors.primary : colors.border,
                              backgroundColor: isSel ? colors.primary + '10' : colors.surface,
                              borderRadius: radius.full,
                              paddingHorizontal: spacing.md,
                              paddingVertical: spacing.xs,
                            },
                          ]}
                        >
                          <Text style={[styles.serviceChipText, { color: isSel ? colors.primary : colors.textSecondary, fontWeight: isSel ? '800' : '600' }]}>
                            {srv.name}
                          </Text>
                          {isSel && <Check size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {formErrors.services && (
                  <Text style={[styles.errorText, { color: colors.error, fontSize: typography.caption }]}>{formErrors.services}</Text>
                )}
              </View>
            )}

            {/* Active Switch */}
            <View style={[styles.rowContainer, { paddingVertical: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>Active Status</Text>
                <Text style={{ color: colors.textSecondary, fontSize: typography.caption }}>
                  Inactive doctors cannot accept new bookings
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
                disabled={isSaving}
              />
            </View>

            {/* Action Buttons */}
            <AppButton
              title="Save Doctor Changes"
              onPress={handleSave}
              loading={isSaving}
              style={{ marginTop: spacing.lg }}
            />

            <AppButton
              title="Cancel"
              onPress={() => navigation.goBack()}
              variant="outline"
              disabled={isSaving}
              style={{ marginTop: spacing.sm, borderColor: colors.border }}
            />

          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '800',
    marginLeft: 20,
  },
  formCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarPressable: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 4,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarTip: {
    fontWeight: '600',
  },
  rowFields: {
    flexDirection: 'row',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontWeight: '800',
    marginBottom: 8,
  },
  segmentContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentButton: {
    flex: 1,
    height: 40,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontWeight: '800',
  },
  centerList: {
    gap: 8,
  },
  selectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
  },
  selectionText: {},
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
  },
  serviceChipText: {
    fontSize: 12,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.06)',
    marginTop: 8,
  },
  rowTitle: {
    fontWeight: '800',
    marginBottom: 2,
  },
  errorText: {
    fontWeight: '700',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
});

export default EditDoctorScreen;
