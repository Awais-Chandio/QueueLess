import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Calendar as CalendarIcon, Clock, ChevronRight } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { supabase } from '../../../lib/supabase';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import { formatAppointmentDateInput, isPastAppointmentSlot } from '../utils/appointmentTime';
import type { AppStackParamList } from '../../../navigation/types';
import { doctorService } from '../../../services/doctorService';

type SelectSlotRouteProp = RouteProp<AppStackParamList, 'SelectSlot'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'SelectSlot'>;

const SelectSlotScreen = () => {
  const route = useRoute<SelectSlotRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const { doctorId, centerId, serviceId } = route.params;

  const [doctor, setDoctor] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockingSlot, setLockingSlot] = useState<string | null>(null);

  // Tabs: 'today' | 'tomorrow' | 'custom'
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow' | 'custom'>('today');

  const todayDate = React.useMemo(() => new Date(), []);
  const tomorrowDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  const fetchDoctorInfo = async () => {
    try {
      const data = await doctorService.getDoctorById(doctorId);
      setDoctor(data);
    } catch (err) {
      console.warn('Failed to load doctor details:', err);
    }
  };

  const loadSlots = useCallback(async () => {
    try {
      setLoading(true);
      
      let targetDate = todayDate;
      if (activeTab === 'tomorrow') {
        targetDate = tomorrowDate;
      } else if (activeTab === 'custom') {
        targetDate = selectedDate;
      }
      
      const dateStr = formatAppointmentDateInput(targetDate);
      
      const { data, error } = await supabase.rpc('get_available_slots', {
        p_doctor_id: doctorId,
        p_date: dateStr,
      });

      if (error) throw error;
      setSlots(data || []);
    } catch (err: any) {
      console.warn('Error fetching slots:', err);
      Alert.alert('Error', 'Failed to load available slots.');
    } finally {
      setLoading(false);
    }
  }, [doctorId, activeTab, selectedDate, todayDate, tomorrowDate]);

  useEffect(() => {
    fetchDoctorInfo();
  }, [doctorId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      setActiveTab('custom');
    }
  };

  const handleSelectSlot = async (slot: string) => {
    if (lockingSlot) return;
    try {
      setLockingSlot(slot);
      
      let targetDate = todayDate;
      if (activeTab === 'tomorrow') {
        targetDate = tomorrowDate;
      } else if (activeTab === 'custom') {
        targetDate = selectedDate;
      }
      const dateStr = formatAppointmentDateInput(targetDate);

      const { data: lockId, error } = await supabase.rpc('lock_slot', {
        p_doctor_id: doctorId,
        p_center_id: centerId,
        p_date: dateStr,
        p_time: slot,
      });

      if (error || !lockId) {
        Alert.alert('Slot unavailable', 'Please pick another time.');
        return;
      }

      const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes
      navigation.navigate('PatientDetails', {
        lockId,
        doctorId,
        centerId,
        serviceId,
        selectedDate: dateStr,
        slot,
        expiryTime,
      });
    } catch (err) {
      console.warn('Error locking slot:', err);
      Alert.alert('Error', 'Unable to lock this slot. Please try again.');
    } finally {
      setLockingSlot(null);
    }
  };

  const activeDateLabel = React.useMemo(() => {
    let date = todayDate;
    if (activeTab === 'tomorrow') date = tomorrowDate;
    else if (activeTab === 'custom') date = selectedDate;

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, [activeTab, selectedDate, todayDate, tomorrowDate]);

  const morningSlots = slots.filter(slot => {
    const lower = slot.toLowerCase();
    if (lower.includes('am')) return true;
    if (lower.includes('pm')) return false;
    const hour = parseInt(slot.split(':')[0], 10);
    return hour < 12;
  });

  const eveningSlots = slots.filter(slot => {
    const lower = slot.toLowerCase();
    if (lower.includes('pm')) return true;
    if (lower.includes('am')) return false;
    const hour = parseInt(slot.split(':')[0], 10);
    return hour >= 12;
  });

  const renderSlotChip = (slot: string) => {
    const isLocking = lockingSlot === slot;
    
    // Determine the date string for slot validation
    let targetDate = todayDate;
    if (activeTab === 'tomorrow') {
      targetDate = tomorrowDate;
    } else if (activeTab === 'custom') {
      targetDate = selectedDate;
    }
    const dateStr = formatAppointmentDateInput(targetDate);
    const pastSlot = isPastAppointmentSlot(dateStr, slot);
    const isDisabled = !!lockingSlot || pastSlot;

    return (
      <Pressable
        key={slot}
        onPress={() => handleSelectSlot(slot)}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.slotChip,
          {
            borderColor: pastSlot ? colors.border + '30' : colors.border,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            backgroundColor: pastSlot ? colors.background : colors.surface,
            opacity: pastSlot ? 0.4 : 1,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        {isLocking ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[
            styles.slotText,
            {
              color: pastSlot ? colors.textSecondary : colors.text,
              fontSize: typography.sizes.sm,
              fontWeight: '700',
              textDecorationLine: pastSlot ? 'line-through' : 'none'
            }
          ]}>
            {slot}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', marginBottom: spacing.sm }]}>
          Select Time Slot
        </Text>

        {doctor && (
          <Card variant="flat" style={[styles.doctorCard, { backgroundColor: colors.surface, padding: spacing.md, marginBottom: spacing.lg }]}>
            <Text style={[styles.docName, { color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }]}>
              {doctor.name}
            </Text>
            <Text style={[styles.docSpec, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              {doctor.specialty} • {doctor.qualification}
            </Text>
          </Card>
        )}

        {/* Date Segment Control */}
        <View style={[styles.tabBar, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }]}>
          <Pressable
            onPress={() => setActiveTab('today')}
            style={[
              styles.tabItem,
              activeTab === 'today' && { backgroundColor: colors.primary, borderRadius: radius.md - 2 }
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'today' ? '#FFFFFF' : colors.textSecondary }]}>
              Today
            </Text>
            <Text style={[styles.tabSubtext, { color: activeTab === 'today' ? 'rgba(255,255,255,0.8)' : colors.textSecondary + 'B0' }]}>
              {todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('tomorrow')}
            style={[
              styles.tabItem,
              activeTab === 'tomorrow' && { backgroundColor: colors.primary, borderRadius: radius.md - 2 }
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'tomorrow' ? '#FFFFFF' : colors.textSecondary }]}>
              Tomorrow
            </Text>
            <Text style={[styles.tabSubtext, { color: activeTab === 'tomorrow' ? 'rgba(255,255,255,0.8)' : colors.textSecondary + 'B0' }]}>
              {tomorrowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[
              styles.tabItem,
              activeTab === 'custom' && { backgroundColor: colors.primary, borderRadius: radius.md - 2 }
            ]}
          >
            <CalendarIcon size={16} color={activeTab === 'custom' ? '#FFFFFF' : colors.textSecondary} style={{ marginBottom: 2 }} />
            <Text style={[styles.tabText, { color: activeTab === 'custom' ? '#FFFFFF' : colors.textSecondary }]}>
              {activeTab === 'custom' ? 'Selected' : 'Pick Date'}
            </Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={handleDateChange}
          />
        )}

        {/* Selected Date Header */}
        <View style={styles.selectedDateHeader}>
          <CalendarIcon size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.selectedDateText, { color: colors.text }]}>
            Slots for {activeDateLabel}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : slots.length === 0 ? (
          <View style={[styles.emptyContainer, { padding: spacing.xl }]}>
            <Clock size={40} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: typography.sizes.sm, fontWeight: '600' }}>
              No available slots for this date.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {morningSlots.length > 0 && (
              <View>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.sm, textTransform: 'uppercase' }}>
                  Morning Slots
                </Text>
                <View style={styles.slotsGrid}>
                  {morningSlots.map(slot => renderSlotChip(slot))}
                </View>
              </View>
            )}

            {eveningSlots.length > 0 && (
              <View>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '800', marginBottom: spacing.sm, textTransform: 'uppercase' }}>
                  Evening Slots
                </Text>
                <View style={styles.slotsGrid}>
                  {eveningSlots.map(slot => renderSlotChip(slot))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
};

export default SelectSlotScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  title: {},
  doctorCard: {},
  docName: {},
  docSpec: {},
  tabBar: {
    flexDirection: 'row',
    borderWidth: 1.2,
    padding: 3,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
  },
  tabSubtext: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  selectedDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectedDateText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  loaderContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slotChip: {
    width: '30%',
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {},
});
