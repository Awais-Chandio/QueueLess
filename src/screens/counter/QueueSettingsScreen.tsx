import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Coffee, Clock, ShieldCheck } from 'lucide-react-native';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import AppButton from '../../components/ui/AppButton';
import { Card } from '../../components/ui/Card';
import { StatusChip } from '../../components/ui/StatusChip';
import { useAuth } from '../../hooks/useAuth';
import { useProfileStore } from '../../store/profileStore';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import { queueService } from '../../services/queueService';
import { toastService } from '../../services/toastService';

const QueueSettingsScreen = () => {
  const navigation = useNavigation();
  const { colors, spacing, typography, radius } = useTheme();
  const queryClient = useQueryClient();
  const profile = useProfileStore(state => state.profile);

  const [loading, setLoading] = useState(true);
  const [doctorSettings, setDoctorSettings] = useState<any>(null);
  const [updatingBreak, setUpdatingBreak] = useState(false);
  const [updatingTime, setUpdatingTime] = useState<number | null>(null);

  const loadCenterSettings = useCallback(async () => {
    if (!profile?.center_id) return;
    try {
      setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const settings = await queueService.fetchCenterSettings(profile.center_id, todayStr);
      setDoctorSettings(settings);
    } catch (err) {
      console.warn('Failed to load center settings:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.center_id]);

  useEffect(() => {
    loadCenterSettings();
  }, [loadCenterSettings]);

  const handleToggleBreak = async () => {
    if (!profile?.center_id) return;
    try {
      setUpdatingBreak(true);
      const nextBreakState = !doctorSettings?.is_on_break;
      const start = nextBreakState ? new Date().toISOString() : null;
      const end = nextBreakState ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
      const todayStr = new Date().toISOString().split('T')[0];

      const updated = await queueService.setCenterBreak(
        profile.center_id,
        todayStr,
        nextBreakState,
        start,
        end,
      );
      setDoctorSettings(updated);
      toastService.success(nextBreakState ? 'Center queue is now on break.' : 'Center queue is back from break.');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
    } catch (err: any) {
      toastService.error(err.message || 'Failed to update break settings.');
    } finally {
      setUpdatingBreak(false);
    }
  };

  const handleUpdateAvgTime = async (mins: number) => {
    if (!profile?.center_id) return;
    try {
      setUpdatingTime(mins);
      const todayStr = new Date().toISOString().split('T')[0];
      const updated = await queueService.updateCenterAverageConsultationTime(
        profile.center_id,
        todayStr,
        mins,
      );
      setDoctorSettings(updated);
      toastService.success(`Average consultation time updated to ${mins} mins.`);
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
    } catch (err: any) {
      toastService.error(err.message || 'Failed to update average time.');
    } finally {
      setUpdatingTime(null);
    }
  };

  return (
    <ScreenWrapper scrollable>
      {/* Header */}
      <View style={[styles.header, { marginBottom: spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={scaleFont(24)} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Queue Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {/* Break Settings Card */}
          <Card variant="elevated" style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Coffee size={scaleFont(18)} color={colors.warning} />
                <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                  Center Service Break
                </Text>
              </View>
              <StatusChip
                status={doctorSettings?.is_on_break ? 'cancelled' : 'confirmed'}
                label={doctorSettings?.is_on_break ? 'On Break' : 'Active'}
              />
            </View>

            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Temporarily pause patient arrivals or consultations center-wide. Existing queue numbers are preserved.
            </Text>

            <AppButton
              title={doctorSettings?.is_on_break ? 'Resume Center Service' : 'Put Center on Break'}
              variant={doctorSettings?.is_on_break ? 'success' : 'danger'}
              loading={updatingBreak}
              disabled={updatingBreak}
              onPress={handleToggleBreak}
              style={{ marginTop: spacing.sm }}
            />
          </Card>

          {/* Consultation Time Settings Card */}
          <Card variant="elevated" style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Clock size={scaleFont(18)} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                Average Consultation Time
              </Text>
            </View>

            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Adjust average consultation duration. This updates patients' estimated wait time estimates in real time.
            </Text>

            <View style={styles.buttonGrid}>
              {[10, 15, 20, 30].map(mins => {
                const isSelected = doctorSettings?.avg_consultation_mins === mins;
                const isBusy = updatingTime === mins;

                return (
                  <Pressable
                    key={mins}
                    disabled={updatingTime !== null}
                    onPress={() => handleUpdateAvgTime(mins)}
                    style={({ pressed }) => [
                      styles.timeButton,
                      {
                        borderColor: isSelected ? colors.primary : colors.border + '50',
                        backgroundColor: isSelected ? colors.primary + '12' : 'transparent',
                        borderRadius: radius.md,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text
                        style={[
                          styles.timeButtonText,
                          {
                            color: isSelected ? colors.primary : colors.text,
                            fontSize: typography.sizes.md,
                          },
                        ]}
                      >
                        {mins} Min
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Info Banner */}
          <View
            style={[
              styles.infoBanner,
              { backgroundColor: colors.primary + '10', borderRadius: radius.md, padding: spacing.md },
            ]}
          >
            <ShieldCheck size={scaleFont(18)} color={colors.primary} />
            <Text style={[styles.infoBannerText, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
              These settings only modify the queue behavior for today and automatically reset overnight.
            </Text>
          </View>
        </View>
      )}
    </ScreenWrapper>
  );
};

export default QueueSettingsScreen;

const styles = StyleSheet.create({
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
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeButton: {
    flex: 1,
    minWidth: 70,
    height: 48,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeButtonText: {
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
