import { supabase } from '../../../lib/supabase';
import type { Doctor } from '../../../types/doctor';
import type { DoctorSchedule } from './doctorDashboardService';

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string;
  reason: string | null;
}

export type DaySchedulePayload = {
  start_time: string;
  end_time: string;
  slot_duration: number;
  is_available: boolean;
};

export const doctorAvailabilityService = {
  async getDoctorProfile(profileId: string): Promise<Doctor> {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      console.error('[doctorAvailabilityService] Error getting doctor profile:', error);
      throw error;
    }
    if (!data) {
      throw new Error('Doctor profile not found.');
    }
    return data as Doctor;
  },

  async updateBreakMode(doctorId: string, isOnBreak: boolean): Promise<void> {
    // doctors.is_on_break drives booking availability; doctor_queue_settings drives
    // the live queue (appointments_full), so both must change together.
    const { error } = await supabase
      .from('doctors')
      .update({ is_on_break: isOnBreak })
      .eq('id', doctorId);

    if (error) {
      console.error('[doctorAvailabilityService] Error updating break mode:', error);
      throw error;
    }

    const now = new Date().toISOString();
    const { error: settingsError } = await supabase
      .from('doctor_queue_settings')
      .upsert(
        {
          doctor_id: doctorId,
          is_on_break: isOnBreak,
          break_start: isOnBreak ? now : null,
          break_end: null,
          updated_at: now,
        },
        { onConflict: 'doctor_id' },
      );

    if (settingsError) {
      console.error('[doctorAvailabilityService] Error updating queue break settings:', settingsError);
      throw settingsError;
    }
  },

  async getWeeklySchedule(doctorId: string): Promise<(DoctorSchedule & { id: string; is_available: boolean })[]> {
    const { data, error } = await supabase
      .from('doctor_schedules')
      .select('id, day_of_week, start_time, end_time, max_tokens_per_day, slot_duration_minutes, is_available')
      .eq('doctor_id', doctorId)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.error('[doctorAvailabilityService] Error fetching weekly schedule:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      slot_duration: row.slot_duration_minutes,
      is_available: row.is_available,
      max_tokens_per_day: row.max_tokens_per_day,
    })) as (DoctorSchedule & { id: string; is_available: boolean })[];
  },

  async updateDayAvailability(availabilityId: string, updates: DaySchedulePayload): Promise<void> {
    const { slot_duration, is_available, ...rest } = updates;
    const { error } = await supabase
      .from('doctor_schedules')
      .update({
        ...rest,
        slot_duration_minutes: slot_duration,
        is_available,
      })
      .eq('id', availabilityId);

    if (error) {
      console.error('[doctorAvailabilityService] Error updating day availability:', error);
      throw error;
    }
  },

  /**
   * Creates or updates one weekday. Doctors created before schedules were
   * seeded can be missing rows (e.g. no Sunday), which previously left no way
   * to open that day. (doctor_id, day_of_week) is unique, so upsert is safe.
   */
  async upsertDay(doctorId: string, dayOfWeek: number, updates: DaySchedulePayload): Promise<void> {
    const { error } = await supabase.from('doctor_schedules').upsert(
      {
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        start_time: updates.start_time,
        end_time: updates.end_time,
        slot_duration_minutes: updates.slot_duration,
        is_available: updates.is_available,
      },
      { onConflict: 'doctor_id,day_of_week' },
    );

    if (error) {
      console.error('[doctorAvailabilityService] Error saving day:', error);
      throw error;
    }
  },

  /** Active (not cancelled/missed) booking counts per date for this doctor. */
  async getBookingCounts(doctorId: string, fromDate: string, toDate: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_date, status')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', fromDate)
      .lte('appointment_date', toDate)
      .in('status', ['pending', 'confirmed', 'checked_in', 'called', 'in_progress']);

    if (error) {
      console.error('[doctorAvailabilityService] Error counting bookings:', error);
      throw error;
    }

    return (data ?? []).reduce<Record<string, number>>((acc, row) => {
      if (row.appointment_date) {
        acc[row.appointment_date] = (acc[row.appointment_date] ?? 0) + 1;
      }
      return acc;
    }, {});
  },

  async getLeaves(doctorId: string): Promise<DoctorLeave[]> {
    const { data, error } = await supabase
      .from('doctor_leaves')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('leave_date', { ascending: true });

    if (error) {
      console.error('[doctorAvailabilityService] Error fetching leaves:', error);
      throw error;
    }

    return (data || []) as DoctorLeave[];
  },

  /**
   * Adds leave for several dates in one insert. A single statement is atomic,
   * so an overlap can no longer leave half a range saved; dates already on
   * leave are skipped rather than failing the unique (doctor_id, leave_date).
   */
  async addLeaves(doctorId: string, dates: string[], reason: string): Promise<number> {
    if (dates.length === 0) return 0;

    const { data: existing, error: readError } = await supabase
      .from('doctor_leaves')
      .select('leave_date')
      .eq('doctor_id', doctorId)
      .in('leave_date', dates);

    if (readError) {
      console.error('[doctorAvailabilityService] Error reading leaves:', readError);
      throw readError;
    }

    const taken = new Set((existing ?? []).map(row => row.leave_date));
    const rows = dates
      .filter(date => !taken.has(date))
      .map(date => ({ doctor_id: doctorId, leave_date: date, reason: reason.trim() || null }));

    if (rows.length === 0) return 0;

    const { error } = await supabase.from('doctor_leaves').insert(rows);
    if (error) {
      console.error('[doctorAvailabilityService] Error adding leave:', error);
      throw error;
    }
    return rows.length;
  },

  async deleteLeaves(leaveIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('doctor_leaves')
      .delete()
      .in('id', leaveIds);

    if (error) {
      console.error('[doctorAvailabilityService] Error deleting leave:', error);
      throw error;
    }
  },
};
