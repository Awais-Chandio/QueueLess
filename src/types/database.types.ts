export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          full_name: string;
          email: string;
          phone: string;
          avatar_url: string;
          updated_at: string;
          role: 'client' | 'staff' | 'admin';
          auth_provider: string;
          center_id: string | null;
          fcm_token: string | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          full_name: string;
          email: string;
          phone?: string;
          avatar_url?: string;
          updated_at?: string;
          role?: 'client' | 'staff' | 'admin';
          auth_provider?: string;
          center_id?: string | null;
          fcm_token?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          full_name?: string;
          email?: string;
          phone?: string;
          avatar_url?: string;
          updated_at?: string;
          role?: 'client' | 'staff' | 'admin';
          auth_provider?: string;
          center_id?: string | null;
          fcm_token?: string | null;
        };
      };
      doctors: {
        Row: {
          id: string;
          center_id: string;
          name: string;
          specialty: string;
          qualification: string | null;
          experience_years: number;
          photo_url: string | null;
          bio: string | null;
          is_active: boolean;
          is_on_break: boolean;
          created_at: string;
          profile_id: string | null;
          employee_code: string | null;
          license_number: string | null;
          gender: string | null;
          fee: number | null;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          center_id: string;
          name: string;
          specialty: string;
          qualification?: string | null;
          experience_years?: number;
          photo_url?: string | null;
          bio?: string | null;
          is_active?: boolean;
          is_on_break?: boolean;
          created_at?: string;
          profile_id?: string | null;
          employee_code?: string | null;
          license_number?: string | null;
          gender?: string | null;
          fee?: number | null;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          center_id?: string;
          name?: string;
          specialty?: string;
          qualification?: string | null;
          experience_years?: number;
          photo_url?: string | null;
          bio?: string | null;
          is_active?: boolean;
          is_on_break?: boolean;
          created_at?: string;
          profile_id?: string | null;
          employee_code?: string | null;
          license_number?: string | null;
          gender?: string | null;
          fee?: number | null;
          status?: string | null;
          updated_at?: string;
        };
      };
      doctor_services: {
        Row: {
          doctor_id: string;
          service_id: string;
        };
        Insert: {
          doctor_id: string;
          service_id: string;
        };
        Update: {
          doctor_id?: string;
          service_id?: string;
        };
      };
      doctor_schedules: {
        Row: {
          id: string;
          doctor_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          max_tokens_per_day: number;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          max_tokens_per_day?: number;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          max_tokens_per_day?: number;
        };
      };
      doctor_leaves: {
        Row: {
          id: string;
          doctor_id: string;
          leave_date: string;
          reason: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          leave_date: string;
          reason?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          leave_date?: string;
          reason?: string | null;
        };
      };
      doctor_queue_settings: {
        Row: {
          doctor_id: string;
          current_token: number;
          average_consultation_time: number;
          break_start: string | null;
          break_end: string | null;
          is_on_break: boolean;
          updated_at: string;
        };
        Insert: {
          doctor_id: string;
          current_token?: number;
          average_consultation_time?: number;
          break_start?: string | null;
          break_end?: string | null;
          is_on_break?: boolean;
          updated_at?: string;
        };
        Update: {
          doctor_id?: string;
          current_token?: number;
          average_consultation_time?: number;
          break_start?: string | null;
          break_end?: string | null;
          is_on_break?: boolean;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          user_id: string;
          center_id: string;
          service_id: string;
          appointment_date: string;
          appointment_time: string | null;
          scheduled_at: string;
          token_number: number | null;
          status: 'pending' | 'confirmed' | 'checked_in' | 'called' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show' | 'skipped';
          estimated_wait_mins: number;
          notes: string | null;
          created_at: string;
          approved_by: string | null;
          approved_at: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          completed_at: string | null;
          cancel_reason: string | null;
          queue_position: number;
          called_at: string | null;
          checked_in_at: string | null;
          started_at: string | null;
          is_currently_serving: boolean;
          doctor_id: string | null;
          skipped_at: string | null;
          duration_minutes: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          center_id: string;
          service_id: string;
          appointment_date: string;
          appointment_time?: string | null;
          scheduled_at: string;
          token_number?: number | null;
          status?: 'pending' | 'confirmed' | 'checked_in' | 'called' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show' | 'skipped';
          estimated_wait_mins?: number;
          notes?: string | null;
          created_at?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          completed_at?: string | null;
          cancel_reason?: string | null;
          queue_position?: number;
          called_at?: string | null;
          checked_in_at?: string | null;
          started_at?: string | null;
          is_currently_serving?: boolean;
          doctor_id?: string | null;
          skipped_at?: string | null;
          duration_minutes?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          center_id?: string;
          service_id?: string;
          appointment_date?: string;
          appointment_time?: string | null;
          scheduled_at?: string;
          token_number?: number | null;
          status?: 'pending' | 'confirmed' | 'checked_in' | 'called' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show' | 'skipped';
          estimated_wait_mins?: number;
          notes?: string | null;
          created_at?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          completed_at?: string | null;
          cancel_reason?: string | null;
          queue_position?: number;
          called_at?: string | null;
          checked_in_at?: string | null;
          started_at?: string | null;
          is_currently_serving?: boolean;
          doctor_id?: string | null;
          skipped_at?: string | null;
          duration_minutes?: number | null;
        };
      };
      services: {
        Row: {
          id: string;
          center_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number;
          created_at: string;
          on_duty_note: string | null;
        };
        Insert: {
          id?: string;
          center_id: string;
          name: string;
          description?: string | null;
          duration_minutes?: number;
          price: number;
          created_at?: string;
          on_duty_note?: string | null;
        };
        Update: {
          id?: string;
          center_id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          created_at?: string;
          on_duty_note?: string | null;
        };
      };
      service_centers: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          city: string;
          address: string | null;
          image_url: string | null;
          created_at: string;
          category: string | null;
          open_time: string | null;
          close_time: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          city: string;
          address?: string | null;
          image_url?: string | null;
          created_at?: string;
          category?: string | null;
          open_time?: string | null;
          close_time?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          city?: string;
          address?: string | null;
          image_url?: string | null;
          created_at?: string;
          category?: string | null;
          open_time?: string | null;
          close_time?: string | null;
        };
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          fcm_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fcm_token: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fcm_token?: string;
          created_at?: string;
        };
      };
      center_queue_settings: {
        Row: {
          id: string;
          center_id: string;
          current_token: number;
          today_date: string;
          created_at: string;
          appointment_date: string;
          is_on_break: boolean;
          break_start: string | null;
          break_end: string | null;
          average_consultation_time: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          center_id: string;
          current_token?: number;
          today_date?: string;
          created_at?: string;
          appointment_date: string;
          is_on_break?: boolean;
          break_start?: string | null;
          break_end?: string | null;
          average_consultation_time?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          center_id?: string;
          current_token?: number;
          today_date?: string;
          created_at?: string;
          appointment_date?: string;
          is_on_break?: boolean;
          break_start?: string | null;
          break_end?: string | null;
          average_consultation_time?: number;
          updated_at?: string;
        };
      };
      center_daily_tokens: {
        Row: {
          center_id: string;
          appointment_date: string;
          last_token_number: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          center_id: string;
          appointment_date: string;
          last_token_number?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          center_id?: string;
          appointment_date?: string;
          last_token_number?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      queue_updates: {
        Row: {
          id: string;
          appointment_id: string;
          current_position: number;
          people_ahead: number;
          estimated_wait_mins: number;
          status: string;
          created_at: string;
          updated_by: string | null;
          current_serving_token: number | null;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          current_position: number;
          people_ahead: number;
          estimated_wait_mins: number;
          status: string;
          created_at?: string;
          updated_by?: string | null;
          current_serving_token?: number | null;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          current_position?: number;
          people_ahead?: number;
          estimated_wait_mins?: number;
          status?: string;
          created_at?: string;
          updated_by?: string | null;
          current_serving_token?: number | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          staff_user_id: string;
          appointment_id: string;
          action: string;
          old_status: string | null;
          new_status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          staff_user_id: string;
          appointment_id: string;
          action: string;
          old_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          staff_user_id?: string;
          appointment_id?: string;
          action?: string;
          old_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          status: string;
          created_at: string;
          appointment_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          body: string;
          status?: string;
          created_at?: string;
          appointment_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          body?: string;
          status?: string;
          created_at?: string;
          appointment_id?: string | null;
        };
      };
    };
    Views: {
      appointments_full: {
        Row: {
          id: string;
          user_id: string;
          patient_name: string | null;
          center_id: string;
          service_id: string;
          doctor_id: string | null;
          doctor_name: string | null;
          center_name: string | null;
          service_name: string | null;
          scheduled_at: string;
          appointment_date: string;
          appointment_time: string | null;
          status: string;
          token_number: number | null;
          notes: string | null;
          cancel_reason: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          checked_in_at: string | null;
          called_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          skipped_at: string | null;
          duration_minutes: number | null;
          created_at: string;
          estimated_wait_mins: number | null;
          estimated_wait_time: number | null;
          current_position: number | null;
          queue_position: number | null;
          people_ahead: number | null;
          queue_status: string | null;
          current_serving_token: number | null;
          current_token: number | null;
          doctor_average_time: number;
          average_consultation_time: number;
          is_on_break: boolean;
          break_start: string | null;
          break_end: string | null;
        };
      };
    };
    Functions: {
      get_doctor_availability: {
        Args: {
          p_doctor_id: string;
        };
        Returns: {
          status: string;
          tokens_ahead: number;
          estimated_wait_minutes: number;
        }[];
      };
      get_current_token: {
        Args: {
          p_center_id: string;
          p_queue_date?: string;
        };
        Returns: number;
      };
      get_next_token: {
        Args: {
          p_center_id: string;
          p_appointment_date: string;
        };
        Returns: number;
      };
      get_center_queue_snapshot: {
        Args: {
          p_center_id: string;
          p_queue_date?: string;
        };
        Returns: Json;
      };
      get_appointment_queue_snapshot: {
        Args: {
          p_appointment_id: string;
        };
        Returns: Json;
      };
      people_ahead: {
        Args: {
          p_appointment_id: string;
        };
        Returns: number;
      };
      call_appointment: {
        Args: {
          p_appointment_id: string;
        };
        Returns: Json;
      };
      start_service: {
        Args: {
          p_appointment_id: string;
        };
        Returns: Json;
      };
      complete_appointment: {
        Args: {
          p_appointment_id: string;
          p_duration_minutes?: number;
        };
        Returns: Json;
      };
      confirm_appointment: {
        Args: {
          p_appointment_id: string;
        };
        Returns: Json;
      };
      cancel_appointment: {
        Args: {
          p_appointment_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      cleanup_stale_appointments: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      update_user_fcm_token: {
        Args: {
          p_token: string;
        };
        Returns: void;
      };
      get_available_slots: {
        Args: {
          p_appointment_date: string;
          p_center_id?: string;
        };
        Returns: string[];
      };
      bookings_per_day: {
        Args: {
          p_range: string;
        };
        Returns: {
          booking_date: string;
          count: number;
        }[];
      };
      busiest_services: {
        Args: {
          p_range: string;
        };
        Returns: {
          service_name: string;
          count: number;
        }[];
      };
      busiest_centers: {
        Args: {
          p_range: string;
        };
        Returns: {
          center_name: string;
          count: number;
        }[];
      };
    };
  };
}
