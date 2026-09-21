import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, TextInput, Alert, BackHandler } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Clock, User, Phone, Mail } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import Card from '../../../components/ui/Card';
import AppInput from '../../../components/ui/AppInput';
import { useTheme } from '../../../hooks/useTheme';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/authStore';
import { useProfileStore } from '../../../store/profileStore';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import type { AppStackParamList } from '../../../navigation/types';

type PatientDetailsRouteProp = RouteProp<AppStackParamList, 'PatientDetails'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'PatientDetails'>;

const PatientDetailsScreen = () => {
  const route = useRoute<PatientDetailsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const { lockId, doctorId, centerId, serviceId, selectedDate, slot, expiryTime } = route.params;

  const user = useAuthStore(state => state.user);
  const profile = useProfileStore(state => state.profile);

  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((expiryTime - Date.now()) / 1000)));

  const shouldReleaseRef = useRef(true);
  const lockExpiredRef = useRef(false);

  useEffect(() => {
    if (profile) {
      setPatientName(profile.full_name || '');
      setPatientPhone(profile.phone || '');
    }
  }, [profile]);

  // Timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && !lockExpiredRef.current) {
        lockExpiredRef.current = true;
        clearInterval(timer);
        handleTimeout();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiryTime]);

  const handleTimeout = async () => {
    shouldReleaseRef.current = false;
    try {
      await supabase.rpc('release_slot', { p_lock_id: lockId });
    } catch (e) {
      console.warn('Error releasing slot on timeout:', e);
    }
    Alert.alert('Lock Expired', 'Your slot lock has expired. Please select a slot again.', [
      {
        text: 'OK',
        onPress: () => navigation.navigate('SelectSlot', { doctorId, centerId, serviceId }),
      },
    ]);
  };

  // Release slot on back
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (shouldReleaseRef.current) {
        supabase.rpc('release_slot', { p_lock_id: lockId }).then(({ error }) => {
          if (error) console.warn('Error releasing slot:', error);
        });
      }
    });

    return unsubscribe;
  }, [navigation, lockId]);

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleNext = () => {
    if (timeLeft <= 0) {
      Alert.alert('Time out', 'Your slot lock has expired. Please choose another slot.');
      return;
    }
    if (!patientName.trim()) {
      Alert.alert('Required Info', 'Please enter patient name.');
      return;
    }
    if (!patientPhone.trim()) {
      Alert.alert('Required Info', 'Please enter patient phone.');
      return;
    }
    shouldReleaseRef.current = false; // keep lock active for ConfirmBookingScreen
    navigation.navigate('ConfirmBooking', {
      lockId,
      doctorId,
      centerId,
      serviceId,
      selectedDate,
      slot,
      notes,
      expiryTime,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            shouldReleaseRef.current = true;
            navigation.goBack();
          }}
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>

        {/* Visible countdown timer */}
        <View style={[styles.timerBadge, { backgroundColor: colors.warning + '15', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
          <Clock size={14} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={[styles.timerText, { color: colors.warning, fontSize: typography.sizes.xs, fontWeight: '800' }]}>
            {formatTimeLeft(timeLeft)}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', marginBottom: spacing.md }]}>
          Patient Details
        </Text>

        <AppInput
          label="Patient Name"
          placeholder="Enter patient full name"
          value={patientName}
          onChangeText={setPatientName}
        />

        <AppInput
          label="Patient Phone"
          placeholder="Enter patient phone number"
          value={patientPhone}
          onChangeText={setPatientPhone}
          keyboardType="phone-pad"
        />

        {/* Notes Input */}
        <AppInput
          label="Symptoms / Reason for Visit (Optional)"
          placeholder="Briefly describe your health issue or instructions for the doctor..."
          multiline
          value={notes}
          onChangeText={setNotes}
        />

        <View style={{ marginTop: spacing.xl }}>
          <AppButton
            title="Continue to Confirmation"
            onPress={handleNext}
            variant="primary"
          />
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

export default PatientDetailsScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {},
  title: {},
  patientCard: {},
  cardHeader: {},
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {},
});
