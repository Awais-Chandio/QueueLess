import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
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

  const title = role === 'admin' ? 'Create Admin Account' : 'Create Staff Account';

  useEffect(() => {
    if (role === 'staff') {
      const fetchCenters = async () => {
        try {
          const { data, error } = await supabase
            .from('service_centers')
            .select('id, name')
            .order('name');
          if (error) throw error;
          setCenters(data || []);
          if (data && data.length > 0) {
            setSelectedCenterId(data[0].id);
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
      await accountService.createManagedAccount({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        centerId: role === 'staff' ? (selectedCenterId ?? undefined) : undefined,
      });

      toastService.success(`${role === 'admin' ? 'Admin' : 'Staff'} account created successfully.`);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
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

          <Card style={{ marginBottom: spacing.lg }}>
            <View style={[styles.warningBanner, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md }]}>
              <View style={styles.warningHeader}>
                <ShieldAlert size={18} color={colors.warning} />
                <Text style={[styles.warningTitle, { color: colors.warning, marginLeft: spacing.sm, fontWeight: '700', fontSize: typography.sizes.sm }]}>Role Architecture Note</Text>
              </View>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.sizes.sm, lineHeight: 18 }}>
                You are creating a new {role} account with a separate login. Existing client appointments will NOT be transferred.
              </Text>
            </View>

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

            {role === 'staff' && (
              <View style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
                <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700', marginBottom: spacing.sm }}>
                  Assign Service Center
                </Text>
                {centers.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontStyle: 'italic' }}>
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
                            borderWidth: 1.5,
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
                            <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? '700' : '500' }}>
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
              title={`Create ${role === 'admin' ? 'Admin' : 'Staff'} Account`}
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
    fontWeight: '600',
  },
  title: {
  },
  warningBanner: {
    borderWidth: 1,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
  },
  errorText: {
    textAlign: 'center',
    fontWeight: '600',
  }
});
