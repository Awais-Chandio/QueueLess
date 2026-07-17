import { supabase } from '../../../lib/supabase';
import type { Doctor } from '../../../types/doctor';

export interface TodayAppointment {
  appointment_id: string;
  patient_name: string;
  appointment_time: string;
  status: string;
  token_number: number;
}

export interface RecentPatient {
  patient_name: string;
  last_appointment_date: string;
  status: string;
}

export interface IncomeSummary {
  today_appointments_count: number;
  completed_count: number;
  total_fee: number;
}

export interface DoctorSchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration: number;
}

export const doctorDashboardService = {
  async getDoctorProfile(profileId: string): Promise<Doctor & { center_name?: string; email?: string; phone?: string }> {
    const { data, error } = await supabase
      .from('doctors')
      .select(`
        *,
        center:service_centers(name),
        profile:profiles(email, phone)
      `)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      console.error('[doctorDashboardService] Error fetching profile:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Doctor profile not found.');
    }

    const { center, profile, ...doctorDetails } = data as any;
    return {
      ...doctorDetails,
      center_name: center?.name,
      email: profile?.email,
      phone: profile?.phone,
    };
  },

  async getTodayAppointments(doctorId: string): Promise<TodayAppointment[]> {
    const { data, error } = await supabase.rpc('get_doctor_today_appointments', {
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[doctorDashboardService] Error fetching today appointments:', error);
      throw error;
    }

    return (data || []) as TodayAppointment[];
  },

  async getDoctorAvailability(doctorId: string): Promise<{ status: string; tokens_ahead: number; estimated_wait_minutes: number }> {
    const { data, error } = await supabase.rpc('get_doctor_availability', {
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[doctorDashboardService] Error fetching availability:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return { status: 'not_working', tokens_ahead: 0, estimated_wait_minutes: 0 };
    }

    return data[0];
  },

  async getRecentPatients(doctorId: string): Promise<RecentPatient[]> {
    const { data, error } = await supabase.rpc('get_doctor_recent_patients', {
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[doctorDashboardService] Error fetching recent patients:', error);
      throw error;
    }

    return (data || []) as RecentPatient[];
  },

  async getIncomeSummary(doctorId: string): Promise<IncomeSummary> {
    const { data, error } = await supabase.rpc('get_doctor_income_summary', {
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[doctorDashboardService] Error fetching income summary:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return { today_appointments_count: 0, completed_count: 0, total_fee: 0 };
    }

    return data[0];
  },

  async getDoctorSchedule(doctorId: string): Promise<DoctorSchedule[]> {
    const { data, error } = await supabase.rpc('get_doctor_schedule', {
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[doctorDashboardService] Error fetching schedule:', error);
      throw error;
    }

    return (data || []) as DoctorSchedule[];
  },
};
