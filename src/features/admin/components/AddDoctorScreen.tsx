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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';

type AddDoctorScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'AddDoctor'>;

const AddDoctorScreen = () => {
  const navigation = useNavigation<AddDoctorScreenNavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('Male'); // 'Male' | 'Female' | 'Other'
  const [specialty, setSpecialty] = useState('General Physician');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [fee, setFee] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Avatar state
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string>('image/jpeg');

  // Directory lists
  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [loadingCenters, setLoadingCenters] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch Centers on mount
  useEffect(() => {
    const loadCenters = async () => {
      setLoadingCenters(true);
      try {
        const data = await centerService.getCenters();
        const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
        setCenters(sorted);
        if (sorted.length > 0) {
          setSelectedCenterId(sorted[0].id);
        }
      } catch (err) {
        console.warn('Failed to load clinics:', err);
        toastService.error('Failed to load clinic centers.');
      } finally {
        setLoadingCenters(false);
      }
    };
    loadCenters();
  }, []);

  // Fetch Services when Center changes
  useEffect(() => {
    if (!selectedCenterId) {
      setServices([]);
      setSelectedServiceIds([]);
      return;
    }

    const loadServices = async () => {
      setLoadingServices(true);
      try {
        const data = await centerService.getCenterServices(selectedCenterId);
        const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
        setServices(sorted);
        setSelectedServiceIds([]); // reset services selection when center changes
      } catch (err) {
        console.warn('Failed to load services:', err);
        toastService.error('Failed to load clinic departments/services.');
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
        maxWidth: 1200,
        maxHeight: 1200,
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorMessage) {
        toastService.error(result.errorMessage);
        return;
      }

      const asset = result.assets?.[0];
      if (__DEV__) {
        console.log('[AddDoctor] Image picker result', {
          hasUri: Boolean(asset?.uri),
          hasBase64: Boolean(asset?.base64),
          base64Length: asset?.base64?.length ?? 0,
          fileSize: asset?.fileSize ?? 0,
          type: asset?.type,
        });
      }

      if (asset?.uri) {
        if (!asset.base64) {
          toastService.error('Selected photo could not be read. Please choose another image.');
          return;
        }
        setAvatarUri(asset.uri);
        setAvatarBase64(asset.base64);
        setAvatarMimeType(asset.type || 'image/jpeg');
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      toastService.error('Failed to launch photo gallery.');
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
    if (!specialty.trim()) errors.specialty = 'Specialty is required';
    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!phone.trim()) errors.phone = 'Phone number is required';
    
    if (!password) {
      errors.password = 'Login password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!qualification.trim()) errors.qualification = 'Qualification is required';
    
    if (!experience.trim()) {
      errors.experience = 'Experience years is required';
    } else if (isNaN(Number(experience)) || Number(experience) < 0) {
      errors.experience = 'Experience must be a positive integer';
    }

    if (!licenseNumber.trim()) errors.licenseNumber = 'License number is required';
    if (!employeeCode.trim()) errors.employeeCode = 'Employee code is required';

    if (!fee.trim()) {
      errors.fee = 'Consultation fee is required';
    } else if (isNaN(Number(fee)) || Number(fee) < 0) {
      errors.fee = 'Consultation fee must be a positive number';
    }

    if (!selectedCenterId) errors.center = 'Assigned center is required';
    if (selectedServiceIds.length === 0) errors.services = 'Select at least one service';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toastService.error('Please correct the errors in the form.');
      return;
    }

    setIsSaving(true);
    try {
      if (__DEV__) {
        console.log('[AddDoctor] Photo save payload', {
          hasBase64: Boolean(avatarBase64),
          base64Length: avatarBase64?.length ?? 0,
          mimeType: avatarMimeType,
        });
      }
      await doctorService.createDoctor({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password: password,
        gender,
        specialty: specialty.trim(),
        qualification: qualification.trim(),
        experienceYears: parseInt(experience.trim(), 10),
        licenseNumber: licenseNumber.trim(),
        employeeCode: employeeCode.trim(),
        fee: parseFloat(fee.trim()),
        centerId: selectedCenterId!,
        serviceIds: selectedServiceIds,
        status: isActive ? 'active' : 'inactive',
        avatarBase64: avatarBase64,
        avatarMimeType: avatarMimeType,
      });

      toastService.success('New doctor registered successfully!');
      navigation.goBack();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('created, but') || errMsg.includes('setup failed')) {
        Alert.alert(
          'Profile Setup Incomplete',
          'Doctor account bana lekin profile setup incomplete raha — dobara try karein ya support ko batayein.',
          [{ text: 'OK' }]
        );
      } else {
        toastService.error(errMsg || 'Failed to register doctor.');
      }
    } finally {
      setIsSaving(false);
    }
  };

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
              Register Doctor
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
                Tap to upload photo
              </Text>
            </View>

            {/* Basic Info */}
            <AppInput
              label="Full Name"
              placeholder="e.g. Dr. John Doe"
              value={name}
              onChangeText={setName}
              error={formErrors.name}
              editable={!isSaving}
            />

            <AppInput
              label="Email Address"
              placeholder="e.g. johndoe@queueless.com"
              value={email}
              onChangeText={setEmail}
              error={formErrors.email}
              keyboardType="email-address"
              autoCapitalize="none"
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

            <AppInput
              label="Login Password"
              placeholder="Minimum 6 characters"
              value={password}
              onChangeText={setPassword}
              error={formErrors.password}
              secureTextEntry
              autoCapitalize="none"
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
              label="Specialty"
              placeholder="e.g. Pediatrician, Dermatologist"
              value={specialty}
              onChangeText={setSpecialty}
              error={formErrors.specialty}
              editable={!isSaving}
            />

            <AppInput
              label="Qualification"
              placeholder="e.g. MBBS, FCPS (Dermatology)"
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

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <AppInput
                  label="Employee Code"
                  placeholder="e.g. EMP-990"
                  value={employeeCode}
                  onChangeText={setEmployeeCode}
                  error={formErrors.employeeCode}
                  editable={!isSaving}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <AppInput
                  label="Consultation Fee"
                  placeholder="Fee in PKR"
                  value={fee}
                  onChangeText={setFee}
                  error={formErrors.fee}
                  keyboardType="numeric"
                  editable={!isSaving}
                />
              </View>
            </View>

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
              title="Save Doctor Profile"
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
});

export default AddDoctorScreen;
