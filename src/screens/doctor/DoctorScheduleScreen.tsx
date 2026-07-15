import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Calendar as CalendarIcon, Clock, ShieldAlert } from 'lucide-react-native';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import AppButton from '../../components/ui/AppButton';
import AppInput from '../../components/ui/AppInput';
import { Card } from '../../components/ui/Card';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont, wp, hp } from '../../utils/responsive';
import { toastService } from '../../services/toastService';
import { CardFadeIn } from '../../components/animations/CardFadeIn';
const DoctorScheduleScreen = () => {
  const navigation = useNavigation();
  const { colors, spacing, typography, radius } = useTheme();

  // Mock working hours
  const workingHours = [
    { day: 'Monday', hours: '09:00 AM - 05:00 PM' },
    { day: 'Tuesday', hours: '09:00 AM - 05:00 PM' },
    { day: 'Wednesday', hours: '09:00 AM - 05:00 PM' },
    { day: 'Thursday', hours: '09:00 AM - 05:00 PM' },
    { day: 'Friday', hours: '09:00 AM - 05:00 PM' },
    { day: 'Saturday', hours: 'Weekly Off' },
    { day: 'Sunday', hours: 'Weekly Off' },
  ];

  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestLeave = async () => {
    if (!leaveDate.trim() || !leaveReason.trim()) {
      Alert.alert('Validation Error', 'Please fill in both the leave date and reason.');
      return;
    }

    setLoading(true);
    // Simulating API call
    setTimeout(() => {
      setLoading(false);
      toastService.success('Leave request submitted successfully!');
      setLeaveDate('');
      setLeaveReason('');
    }, 1200);
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Schedule & Leave</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Working Hours Card */}
      <CardFadeIn delay={100}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Clock size={scaleFont(18)} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                Weekly Working Hours
              </Text>
            </View>

            {workingHours.map((item, idx) => (
              <View
                key={item.day}
                style={[
                  styles.hoursRow,
                  { borderColor: colors.border + '30' },
                  idx > 0 && { borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.sm }
                ]}
              >
                <Text style={[styles.dayText, { color: colors.text }]}>{item.day}</Text>
                <Text
                  style={[
                    styles.timeText,
                    {
                      color: item.hours.includes('Off') ? colors.textSecondary : colors.primary,
                      fontWeight: item.hours.includes('Off') ? '400' : '700'
                    }
                  ]}
                >
                  {item.hours}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      </CardFadeIn>

      {/* Leave Request Card */}
      <CardFadeIn delay={200}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <CalendarIcon size={scaleFont(18)} color={colors.warning} />
              <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                Request Leave
              </Text>
            </View>

            <View style={{ gap: spacing.md }}>
              <AppInput
                placeholder="YYYY-MM-DD"
                label="Date of Leave"
                value={leaveDate}
                onChangeText={setLeaveDate}
              />

              <AppInput
                placeholder="Reason for leave request..."
                label="Reason"
                multiline
                value={leaveReason}
                onChangeText={setLeaveReason}
              />

              <AppButton
                title="Submit Leave Request"
                variant="primary"
                loading={loading}
                onPress={handleRequestLeave}
                style={{ marginTop: spacing.xs }}
              />
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Admin Notice */}
      <View style={[styles.noticeContainer, { backgroundColor: colors.warning + '12', borderRadius: radius.md, padding: spacing.md }]}>
        <ShieldAlert size={scaleFont(18)} color={colors.warning} />
        <Text style={[styles.noticeText, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
          Changes to recurring shift slots must be processed through the center administrator.
        </Text>
      </View>
    </ScreenWrapper>
  );
};

export default DoctorScheduleScreen;

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
  card: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 14,
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
