import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ShieldAlert, Info, ChevronLeft, MapPin } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { accountService } from '../api/accountService';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { toastService } from '../../../services/toastService';
import { centerService } from '../../../services/centerService';
import { supabase } from '../../../lib/supabase';

type CreateAccountScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'CreateAccount'>;
type CreateAccountScreenRouteProp = RouteProp<AdminStackParamList, 'CreateAccount'>;

const CreateAccountScreen = () => {
  const navigation = useNavigation<CreateAccountScreenNavigationProp>();
  const route = useRoute<CreateAccountScreenRouteProp>();
  const { role } = route.params;
  const { colors, spacing, typography, radius } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  // New staff role selection states
  const [selectedRole, setSelectedRole] = useState<'doctor' | 'staff'>('staff');
  const [specialty, setSpecialty] = useState('General Physician');
  const [qualification, setQualification] = useState('');
  const [fee, setFee] = useState('');

  const title = role === 'admin' 
    ? 'Create Admin Account' 
    : selectedRole === 'doctor' 
      ? 'Create Doctor Account' 
      : 'Create Counter Staff Account';

  useEffect(() => {
    if (role === 'staff') {
      const fetchCenters = async () => {
        try {
          const data = await centerService.getCenters();
          const sortedData = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
          setCenters(sortedData);
          if (sortedData && sortedData.length > 0) {
            setSelectedCenterId(sortedData[0].id);
          }
        } catch (err) {
          console.warn('Failed to load centers:', err);
        }
      };
      fetchCenters();
    }
  }, [role]);

  const handleCreateAccount = async () => {
    if (isLoading) return;
    setError(null);

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (role === 'staff' && !selectedCenterId) {
      setError('Please select a service center to assign this staff');
      return;
    }

    if (role === 'staff' && selectedRole === 'doctor') {
      if (!specialty.trim()) {
        setError('Specialty is required for Doctor');
        return;
      }
      if (!qualification.trim()) {
        setError('Qualification is required for Doctor');
        return;
      }
      if (!fee.trim() || isNaN(Number(fee)) || Number(fee) < 0) {
        setError('Please enter a valid consultation fee');
        return;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      const targetRole = role === 'admin' ? 'admin' : selectedRole;
      const result = await accountService.createManagedAccount({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: targetRole,
        centerId: role === 'staff' ? (selectedCenterId ?? undefined) : undefined,
      });

      if (targetRole === 'doctor' && result.userId) {
        const { data: doctor, error: docError } = await supabase
          .from('doctors')
          .insert({
            center_id: selectedCenterId,
            name: name.trim(),
            specialty: specialty.trim() || 'General Physician',
            qualification: qualification.trim(),
            experience_years: 1,
            is_active: true,
            is_on_break: false,
            profile_id: result.userId,
            employee_code: 'EMP-' + Math.random().toString(36).slice(-5).toUpperCase(),
            license_number: 'LIC-' + Math.random().toString(36).slice(-5).toUpperCase(),
            gender: 'Male',
            fee: parseFloat(fee.trim()) || 0,
            status: 'active',
          })
          .select()
          .single();

        if (docError || !doctor) {
          throw new Error(`Account created, but doctor details failed: ${docError?.message || 'No doctor record returned.'}`);
        }

        // Create default doctor queue settings
        const { error: queueSettingsError } = await supabase
          .from('doctor_queue_settings')
          .insert({
            doctor_id: doctor.id,
            current_token: 0,
            average_consultation_time: 10.0,
            is_on_break: false,
          });
        if (queueSettingsError) {
          throw new Error(`Account created, but queue settings generation failed: ${queueSettingsError.message}`);
        }
      }

      toastService.success(`${targetRole === 'admin' ? 'Admin' : targetRole === 'doctor' ? 'Doctor' : 'Staff'} account created successfully.`);
      navigation.goBack();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('created, but') || errMsg.includes('details failed') || errMsg.includes('settings generation failed')) {
        Alert.alert(
          'Profile Setup Incomplete',
          'Doctor account bana lekin profile setup incomplete raha — dobara try karein ya support ko batayein.',
          [{ text: 'OK' }]
        );
      } else {
        setError(errMsg || 'Failed to create account');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
          {/* Back header button */}
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <ChevronLeft size={24} color={colors.primary} />
            <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
              Back
            </Text>
          </Pressable>

          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', marginBottom: spacing.lg }]}>
            {title}
          </Text>

          <Card style={{ marginBottom: spacing.lg, padding: spacing.md }}>
            <View style={[styles.warningBanner, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md }]}>
              <View style={styles.warningHeader}>
                <ShieldAlert size={18} color={colors.warning} />
                <Text style={[styles.warningTitle, { color: colors.warning, marginLeft: spacing.sm, fontWeight: '800', fontSize: typography.sizes.sm }]}>Role Architecture Note</Text>
              </View>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.sizes.sm, lineHeight: 18, fontWeight: '500' }}>
                You are creating a new {role === 'admin' ? 'admin' : selectedRole === 'doctor' ? 'doctor' : 'staff'} account with a separate login. Existing client appointments will NOT be transferred.
              </Text>
            </View>

            {role === 'staff' && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.sm }}>
                  Select Staff Role
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Pressable
                    onPress={() => setSelectedRole('staff')}
                    style={{
                      flex: 1,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      borderWidth: 1.2,
                      borderColor: selectedRole === 'staff' ? colors.primary : colors.border,
                      backgroundColor: selectedRole === 'staff' ? colors.primary + '10' : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: selectedRole === 'staff' ? colors.primary : colors.text, fontWeight: '800' }}>
                      Front-desk Staff
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedRole('doctor')}
                    style={{
                      flex: 1,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      borderWidth: 1.2,
                      borderColor: selectedRole === 'doctor' ? colors.primary : colors.border,
                      backgroundColor: selectedRole === 'doctor' ? colors.primary + '10' : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: selectedRole === 'doctor' ? colors.primary : colors.text, fontWeight: '800' }}>
                      Doctor
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <AppInput
              placeholder="Full Name"
              label="Full Name"
              value={name}
              onChangeText={setName}
              editable={!isLoading}
            />

            <AppInput
              placeholder="Email Address"
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              editable={!isLoading}
            />

            <AppInput
              placeholder="Password"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              editable={!isLoading}
            />

            <AppInput
              placeholder="Confirm Password"
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={true}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              editable={!isLoading}
            />

            {role === 'staff' && selectedRole === 'doctor' && (
              <Card style={{ padding: spacing.md, marginBottom: spacing.md, borderColor: colors.border + '80', backgroundColor: colors.background + '40' }}>
                <Text style={{ color: colors.primary, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.md }}>
                  Doctor Details
                </Text>
                
                <AppInput
                  placeholder="e.g. Cardiologist, Dermatologist"
                  label="Specialty"
                  value={specialty}
                  onChangeText={setSpecialty}
                  editable={!isLoading}
                />

                <AppInput
                  placeholder="e.g. MBBS, MD, FRCS"
                  label="Qualification"
                  value={qualification}
                  onChangeText={setQualification}
                  editable={!isLoading}
                />

                <AppInput
                  placeholder="e.g. 50"
                  label="Consultation Fee ($)"
                  value={fee}
                  onChangeText={setFee}
                  keyboardType="numeric"
                  editable={!isLoading}
                />
              </Card>
            )}

            {role === 'staff' && (
              <View style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
                <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.sm }}>
                  Assign Service Center
                </Text>
                {centers.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontStyle: 'italic', fontWeight: '500' }}>
                    Loading centers...
                  </Text>
                ) : (
                  <View style={{ gap: spacing.xs }}>
                    {centers.map(center => {
                      const isSelected = selectedCenterId === center.id;
                      return (
                        <Pressable
                          key={center.id}
                          onPress={() => setSelectedCenterId(center.id)}
                          style={{
                            padding: spacing.md,
                            borderRadius: radius.md,
                            borderWidth: 1.2,
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary + '10' : colors.surface,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: spacing.xs,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MapPin size={16} color={isSelected ? colors.primary : colors.textSecondary} style={{ marginRight: spacing.xs }} />
                            <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? '800' : '600' }}>
                              {center.name}
                            </Text>
                          </View>
                          {isSelected && (
                            <View 
                              style={{ 
                                width: 8, 
                                height: 8, 
                                borderRadius: 4, 
                                backgroundColor: colors.primary 
                              }} 
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {error && <Text style={[styles.errorText, { color: colors.error, marginBottom: spacing.md, fontSize: typography.sizes.sm }]}>{error}</Text>}

            <AppButton
              title={`Create ${role === 'admin' ? 'Admin' : selectedRole === 'doctor' ? 'Doctor' : 'Staff'} Account`}
              onPress={handleCreateAccount}
              loading={isLoading}
            />
            
            <AppButton
              title="Cancel"
              onPress={() => navigation.goBack()}
              variant="outline"
              disabled={isLoading}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

export default CreateAccountScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '700',
  },
  title: {},
  warningBanner: {
    borderWidth: 1,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {},
  errorText: {
    textAlign: 'center',
    fontWeight: '800',
  }
});
