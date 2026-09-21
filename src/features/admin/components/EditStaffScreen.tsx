import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronLeft, MapPin } from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import Card from '../../../components/ui/Card';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { useTheme } from '../../../hooks/useTheme';
import type { AdminStackParamList } from '../../../navigation/AdminNavigator';
import { centerService } from '../../../services/centerService';
import { toastService } from '../../../services/toastService';
import { staffFormSchema, type StaffFormData } from '../../../validations/staffSchema';
import { staffService } from '../api/staffService';
import { STAFF_QUERY_KEY } from './ManageStaffScreen';

type EditStaffScreenNavigationProp = NativeStackNavigationProp<AdminStackParamList, 'EditStaff'>;
type EditStaffScreenRouteProp = RouteProp<AdminStackParamList, 'EditStaff'>;

const EditStaffScreen = () => {
  const navigation = useNavigation<EditStaffScreenNavigationProp>();
  const route = useRoute<EditStaffScreenRouteProp>();
  const queryClient = useQueryClient();
  const { colors, spacing, typography, radius } = useTheme();
  const { staffId } = route.params;

  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StaffFormData>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      center_ids: [],
    },
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [member, centerRows] = await Promise.all([
          staffService.getById(staffId),
          centerService.getCenters(),
        ]);
        reset({
          full_name: member.full_name || '',
          email: member.email || '',
          phone: member.phone || '',
          center_ids: member.centers.map(center => center.id),
        });
        setCenters(
          [...(centerRows || [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(center => ({ id: center.id, name: center.name })),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load staff details.';
        setLoadError(message);
        toastService.error('Unable to load staff profile.', message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [reset, staffId]);

  const handleSave = async (data: StaffFormData) => {
    if (saving) return;

    setSaving(true);
    try {
      await staffService.update(staffId, {
        full_name: data.full_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        center_ids: data.center_ids,
      });
      await queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      toastService.success('Staff profile updated successfully.');
      navigation.goBack();
    } catch (error) {
      toastService.error(
        'Unable to update staff profile.',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={24} color={colors.primary} />
            <Text
              style={[
                styles.backText,
                { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs },
              ]}
            >
              Back
            </Text>
          </Pressable>

          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: typography.sizes.xl,
                marginBottom: spacing.lg,
              },
            ]}
          >
            Edit Staff Member
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.md }}>
                Loading staff details...
              </Text>
            </View>
          ) : loadError ? (
            <Card style={{ padding: spacing.md }}>
              <Text style={{ color: colors.error, marginBottom: spacing.md }}>{loadError}</Text>
              <AppButton title="Go Back" variant="outline" onPress={() => navigation.goBack()} />
            </Card>
          ) : (
            <Card style={{ padding: spacing.md }}>
              <Controller
                name="full_name"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <AppInput
                    label="Full Name"
                    placeholder="Full Name"
                    value={value}
                    onChangeText={onChange}
                    error={errors.full_name?.message}
                    required
                    editable={!saving}
                  />
                )}
              />

              <Controller
                name="email"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <AppInput
                    label="Contact Email"
                    placeholder="Email Address"
                    value={value}
                    onChangeText={onChange}
                    error={errors.email?.message}
                    helperText="This updates the staff profile contact email, not their login credentials."
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    required
                    editable={!saving}
                  />
                )}
              />

              <Controller
                name="phone"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <AppInput
                    label="Mobile Number"
                    placeholder="e.g. 03001234567"
                    value={value}
                    onChangeText={onChange}
                    error={errors.phone?.message}
                    keyboardType="phone-pad"
                    required
                    editable={!saving}
                  />
                )}
              />

              <Controller
                name="center_ids"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <View style={{ marginBottom: spacing.md }}>
                <Text
                  style={{
                    color: errors.center_ids ? colors.error : colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    fontWeight: '500',
                    marginBottom: spacing.sm,
                  }}
                >
                  Service Centers <Text style={{ color: colors.error }}>*</Text>
                </Text>

                <View style={{ gap: spacing.xs }}>
                  {centers.map(center => {
                    const selected = value.includes(center.id);
                    return (
                      <Pressable
                        key={center.id}
                        onPress={() => {
                          onChange(
                            selected
                              ? value.filter(centerId => centerId !== center.id)
                              : [...value, center.id],
                          );
                        }}
                        disabled={saving}
                        style={[
                          styles.centerOption,
                          {
                            padding: spacing.md,
                            borderRadius: radius.md,
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? colors.primary + '10' : colors.surface,
                          },
                        ]}
                      >
                        <View style={styles.centerLabel}>
                          <MapPin size={16} color={selected ? colors.primary : colors.textSecondary} />
                          <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: selected ? '800' : '600' }}>
                            {center.name}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected ? colors.primary : colors.surface,
                            },
                          ]}
                        >
                          {selected ? <Check size={14} color={colors.onPrimary} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {errors.center_ids?.message ? (
                  <Text style={{ color: colors.error, fontSize: typography.caption, marginTop: spacing.xs }}>
                    {errors.center_ids.message}
                  </Text>
                ) : null}
                  </View>
                )}
              />

              <AppButton title="Save Changes" onPress={handleSubmit(handleSave)} loading={saving} />
              <AppButton
                title="Cancel"
                onPress={() => navigation.goBack()}
                variant="outline"
                disabled={saving}
                style={{ marginTop: spacing.sm }}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 8,
  },
  backText: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '800',
  },
  loadingContainer: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOption: {
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EditStaffScreen;
