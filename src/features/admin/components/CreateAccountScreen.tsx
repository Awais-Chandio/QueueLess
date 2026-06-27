import React, { useState } from 'react';
import { View, StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { ShieldAlert, Info } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { accountService } from '../api/accountService';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { toastService } from '../../../services/toastService';

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

  const title = role === 'admin' ? 'Create Admin Account' : 'Create Staff Account';

  const handleCreateAccount = async () => {
    if (isLoading) return;
    setError(null);

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required');
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
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, marginBottom: spacing.lg }]}>
            {title}
          </Text>

          <Card style={{ marginBottom: spacing.lg }}>
            <View style={[styles.warningBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }]}>
              <View style={styles.warningHeader}>
                <ShieldAlert size={20} color={colors.warning} />
                <Text style={[styles.warningTitle, { color: colors.warning, marginLeft: spacing.sm, fontWeight: 'bold' }]}>Role Architecture Note</Text>
              </View>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, fontSize: typography.sizes.sm }}>
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

            {error && <Text style={[styles.errorText, { color: colors.error, marginBottom: spacing.md }]}>{error}</Text>}

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
  title: {
    fontWeight: 'bold',
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
    fontWeight: '500',
  }
});
