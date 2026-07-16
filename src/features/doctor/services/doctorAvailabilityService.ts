import { supabase } from '../../../lib/supabase';
import type { Doctor } from '../../../types/doctor';
import type { DoctorSchedule } from './doctorDashboardService';

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string;
  reason: string | null;
  created_at: string;
}

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
    const { error } = await supabase
      .from('doctors')
      .update({ is_on_break: isOnBreak })
      .eq('id', doctorId);

    if (error) {
      console.error('[doctorAvailabilityService] Error updating break mode:', error);
      throw error;
    }
  },

  async getWeeklySchedule(doctorId: string): Promise<(DoctorSchedule & { id: string; is_available: boolean })[]> {
    const { data, error } = await supabase
      .from('doctor_availability')
      .select('id, day_of_week, start_time, end_time, slot_duration, is_available')
      .eq('doctor_id', doctorId)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.error('[doctorAvailabilityService] Error fetching weekly schedule:', error);
      throw error;
    }

    return (data || []) as (DoctorSchedule & { id: string; is_available: boolean })[];
  },

  async updateDayAvailability(
    availabilityId: string,
    updates: {
      start_time: string;
      end_time: string;
      slot_duration: number;
      is_available: boolean;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('doctor_availability')
      .update(updates)
      .eq('id', availabilityId);

    if (error) {
      console.error('[doctorAvailabilityService] Error updating day availability:', error);
      throw error;
    }
  },

  async getLeaves(doctorId: string): Promise<DoctorLeave[]> {
    const { data, error } = await supabase
      .from('doctor_leaves')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('leave_date', { ascending: false });

    if (error) {
      console.error('[doctorAvailabilityService] Error fetching leaves:', error);
      throw error;
    }

    return (data || []) as DoctorLeave[];
  },

  async addLeave(doctorId: string, leaveDate: string, reason: string): Promise<void> {
    const { error } = await supabase
      .from('doctor_leaves')
      .insert({
        doctor_id: doctorId,
        leave_date: leaveDate,
        reason: reason || null,
      });

    if (error) {
      console.error('[doctorAvailabilityService] Error adding leave:', error);
      throw error;
    }
  },

  async deleteLeave(leaveId: string): Promise<void> {
    const { error } = await supabase
      .from('doctor_leaves')
      .delete()
      .eq('id', leaveId);

    if (error) {
      console.error('[doctorAvailabilityService] Error deleting leave:', error);
      throw error;
    }
  },
};
