export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        Insert: {
          appointment_date?: string | null
          appointment_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id: string
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          estimated_wait_mins?: number | null
          id?: string
          is_currently_serving?: boolean | null
          notes?: string | null
          queue_position?: number | null
          scheduled_at: string
          service_id: string
          skipped_at?: string | null
          started_at?: string | null
          status?: string | null
          token_number: number
          user_id: string
        }
        Update: {
          appointment_date?: string | null
          appointment_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id?: string
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          estimated_wait_mins?: number | null
          id?: string
          is_currently_serving?: boolean | null
          notes?: string | null
          queue_position?: number | null
          scheduled_at?: string
          service_id?: string
          skipped_at?: string | null
          started_at?: string | null
          status?: string | null
          token_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          appointment_id: string | null
          created_at: string
          id: string
          new_status: string | null
          old_status: string | null
          staff_user_id: string | null
        }
        Insert: {
          action: string
          appointment_id?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          staff_user_id?: string | null
        }
        Update: {
          action?: string
          appointment_id?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          staff_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "queue_view"
            referencedColumns: ["id"]
          },
        ]
      }
      center_daily_tokens: {
        Row: {
          appointment_date: string
          center_id: string
          created_at: string | null
          last_token_number: number
          updated_at: string | null
        }
        Insert: {
          appointment_date: string
          center_id: string
          created_at?: string | null
          last_token_number?: number
          updated_at?: string | null
        }
        Update: {
          appointment_date?: string
          center_id?: string
          created_at?: string | null
          last_token_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "center_daily_tokens_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_queue_settings: {
        Row: {
          appointment_date: string
          average_consultation_time: number | null
          break_end: string | null
          break_start: string | null
          center_id: string
          created_at: string | null
          current_token: number | null
          id: string
          is_on_break: boolean | null
          today_date: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_date?: string
          average_consultation_time?: number | null
          break_end?: string | null
          break_start?: string | null
          center_id: string
          created_at?: string | null
          current_token?: number | null
          id?: string
          is_on_break?: boolean | null
          today_date?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_date?: string
          average_consultation_time?: number | null
          break_end?: string | null
          break_start?: string | null
          center_id?: string
          created_at?: string | null
          current_token?: number | null
          id?: string
          is_on_break?: boolean | null
          today_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          fcm_token: string
          id: string
          platform: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          fcm_token: string
          id?: string
          platform?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          fcm_token?: string
          id?: string
          platform?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      doctor_leaves: {
        Row: {
          doctor_id: string
          id: string
          leave_date: string
          reason: string | null
        }
        Insert: {
          doctor_id: string
          id?: string
          leave_date: string
          reason?: string | null
        }
        Update: {
          doctor_id?: string
          id?: string
          leave_date?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_leaves_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_queue_settings: {
        Row: {
          average_consultation_time: number
          break_end: string | null
          break_start: string | null
          current_token: number
          doctor_id: string
          is_on_break: boolean
          updated_at: string
        }
        Insert: {
          average_consultation_time?: number
          break_end?: string | null
          break_start?: string | null
          current_token?: number
          doctor_id: string
          is_on_break?: boolean
          updated_at?: string
        }
        Update: {
          average_consultation_time?: number
          break_end?: string | null
          break_start?: string | null
          current_token?: number
          doctor_id?: string
          is_on_break?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      doctor_schedules: {
        Row: {
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_available: boolean
          max_tokens_per_day: number
          slot_duration_minutes: number
          start_time: string
        }
        Insert: {
          day_of_week: number
          doctor_id: string
          end_time: string
          id?: string
          is_available?: boolean
          max_tokens_per_day?: number
          slot_duration_minutes?: number
          start_time: string
        }
        Update: {
          day_of_week?: number
          doctor_id?: string
          end_time?: string
          id?: string
          is_available?: boolean
          max_tokens_per_day?: number
          slot_duration_minutes?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_schedules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_services: {
        Row: {
          doctor_id: string
          service_id: string
        }
        Insert: {
          doctor_id: string
          service_id: string
        }
        Update: {
          doctor_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_services_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_centers: {
        Row: {
          center_id: string
          profile_id: string
        }
        Insert: {
          center_id: string
          profile_id: string
        }
        Update: {
          center_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_centers_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_centers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          bio: string | null
          center_id: string
          created_at: string
          employee_code: string | null
          experience_years: number
          fee: number | null
          gender: string | null
          id: string
          is_active: boolean
          is_on_break: boolean
          license_number: string | null
          name: string
          photo_url: string | null
          profile_id: string | null
          qualification: string | null
          specialty: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          center_id: string
          created_at?: string
          employee_code?: string | null
          experience_years?: number
          fee?: number | null
          gender?: string | null
          id?: string
          is_active?: boolean
          is_on_break?: boolean
          license_number?: string | null
          name: string
          photo_url?: string | null
          profile_id?: string | null
          qualification?: string | null
          specialty: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          center_id?: string
          created_at?: string
          employee_code?: string | null
          experience_years?: number
          fee?: number | null
          gender?: string | null
          id?: string
          is_active?: boolean
          is_on_break?: boolean
          license_number?: string | null
          name?: string
          photo_url?: string | null
          profile_id?: string | null
          qualification?: string | null
          specialty?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_provider: string | null
          avatar_url: string | null
          center_id: string | null
          created_at: string
          email: string | null
          fcm_token: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          auth_provider?: string | null
          avatar_url?: string | null
          center_id?: string | null
          created_at?: string
          email?: string | null
          fcm_token?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          auth_provider?: string | null
          avatar_url?: string | null
          center_id?: string | null
          created_at?: string
          email?: string | null
          fcm_token?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_updates: {
        Row: {
          appointment_id: string
          created_at: string | null
          current_position: number | null
          current_serving_token: number | null
          estimated_wait_mins: number | null
          id: string
          people_ahead: number | null
          status: string | null
          updated_by: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          current_position?: number | null
          current_serving_token?: number | null
          estimated_wait_mins?: number | null
          id?: string
          people_ahead?: number | null
          status?: string | null
          updated_by?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          current_position?: number | null
          current_serving_token?: number | null
          estimated_wait_mins?: number | null
          id?: string
          people_ahead?: number | null
          status?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_updates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_updates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_updates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "queue_view"
            referencedColumns: ["id"]
          },
        ]
      }
      service_centers: {
        Row: {
          address: string
          category: string | null
          city: string
          close_time: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          latitude: number | null
          longitude: number | null
          name: string
          open_time: string | null
        }
        Insert: {
          address: string
          category?: string | null
          city: string
          close_time?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          open_time?: string | null
        }
        Update: {
          address?: string
          category?: string | null
          city?: string
          close_time?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          open_time?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          center_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          name: string
          on_duty_note: string | null
          price: number | null
        }
        Insert: {
          center_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          on_duty_note?: string | null
          price?: number | null
        }
        Update: {
          center_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          on_duty_note?: string | null
          price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "center_services_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_locks: {
        Row: {
          appointment_date: string
          appointment_time: string
          center_id: string | null
          doctor_id: string | null
          expires_at: string
          id: string
          locked_at: string
          user_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          center_id?: string | null
          doctor_id?: string | null
          expires_at?: string
          id?: string
          locked_at?: string
          user_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          center_id?: string | null
          doctor_id?: string | null
          expires_at?: string
          id?: string
          locked_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slot_locks_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "service_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_locks_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      appointments_full: {
        Row: {
          appointment_date: string | null
          appointment_time: string | null
          average_consultation_time: number | null
          break_end: string | null
          break_start: string | null
          called_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string | null
          center_name: string | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          current_position: number | null
          current_serving_token: number | null
          current_token: number | null
          doctor_average_time: number | null
          doctor_id: string | null
          doctor_name: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          estimated_wait_time: number | null
          id: string | null
          is_on_break: boolean | null
          notes: string | null
          patient_name: string | null
          people_ahead: number | null
          queue_position: number | null
          queue_status: string | null
          scheduled_at: string | null
          service_id: string | null
          service_name: string | null
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      current_token_view: {
        Row: {
          current_token: number | null
        }
        Relationships: []
      }
      queue_view: {
        Row: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          estimated_wait_mins: number | null
          id: string | null
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string | null
          service_id: string | null
          started_at: string | null
          status: string | null
          token_number: number | null
          user_id: string | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          estimated_wait_mins?: number | null
          id?: string | null
          is_currently_serving?: boolean | null
          notes?: string | null
          queue_position?: number | null
          scheduled_at?: string | null
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          token_number?: number | null
          user_id?: string | null
        }
        Update: {
          appointment_date?: string | null
          appointment_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          estimated_wait_mins?: number | null
          id?: string | null
          is_currently_serving?: boolean | null
          notes?: string | null
          queue_position?: number | null
          scheduled_at?: string | null
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          token_number?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_staff_account: {
        Args: { staff_profile_id: string }
        Returns: undefined
      }
      book_appointment: {
        Args: { p_lock_id: string; p_notes?: string; p_service_id: string }
        Returns: string
      }
      call_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_appointment: {
        Args: { p_appointment_id: string; p_reason: string }
        Returns: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      cleanup_stale_appointments: { Args: never; Returns: undefined }
      complete_appointment: {
        Args: { p_appointment_id: string; p_duration_minutes?: number }
        Returns: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_doctor_with_account: {
        Args: {
          p_center_id: string
          p_email: string
          p_experience_years: number
          p_full_name: string
          p_password: string
          p_qualification: string
          p_service_ids: string[]
          p_specialty: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      generate_token_number: { Args: { p_center_id: string }; Returns: number }
      get_appointment_queue_snapshot: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      get_available_slots: {
        Args: { p_date: string; p_doctor_id: string }
        Returns: string[]
      }
      get_center_queue_snapshot: {
        Args: { p_center_id: string; p_queue_date?: string }
        Returns: Json
      }
      get_current_token:
        | { Args: never; Returns: number }
        | {
            Args: { p_center_id: string; p_queue_date?: string }
            Returns: number
          }
      get_doctor_availability: {
        Args: { p_doctor_id: string }
        Returns: {
          estimated_wait_minutes: number
          status: string
          tokens_ahead: number
        }[]
      }
      get_doctor_income_summary: {
        Args: { p_doctor_id: string }
        Returns: {
          completed_count: number
          today_appointments_count: number
          total_fee: number
        }[]
      }
      get_doctor_queue_snapshot: {
        Args: { p_doctor_id: string; p_queue_date?: string }
        Returns: Json
      }
      get_doctor_recent_patients: {
        Args: { p_doctor_id: string }
        Returns: {
          last_appointment_date: string
          patient_name: string
          status: string
        }[]
      }
      get_doctor_schedule: {
        Args: { p_doctor_id: string }
        Returns: {
          day_of_week: number
          end_time: string
          slot_duration: number
          start_time: string
        }[]
      }
      get_doctor_today_appointments: {
        Args: { p_doctor_id: string }
        Returns: {
          appointment_id: string
          appointment_time: string
          patient_name: string
          status: string
          token_number: number
        }[]
      }
      get_doctors_availability_batch: {
        Args: { p_doctor_ids: string[] }
        Returns: {
          doctor_id: string
          estimated_wait_minutes: number
          status: string
          tokens_ahead: number
        }[]
      }
      get_my_staff_context: {
        Args: never
        Returns: {
          doctor_id: string
          is_doctor: boolean
          role: string
        }[]
      }
      get_nearby_centers: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number }
        Returns: {
          address: string
          city: string
          close_time: string
          distance_km: number
          id: string
          image_url: string
          latitude: number
          longitude: number
          name: string
          open_time: string
        }[]
      }
      get_next_token: {
        Args: { p_appointment_date: string; p_center_id: string }
        Returns: number
      }
      get_user_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      lock_slot: {
        Args: {
          p_center_id: string
          p_date: string
          p_doctor_id: string
          p_time: string
        }
        Returns: string
      }
      people_ahead:
        | { Args: { my_token: number }; Returns: number }
        | { Args: { p_appointment_id: string }; Returns: number }
      queue_appointment_date: {
        Args: { p_appointment_date: string; p_scheduled_at: string }
        Returns: string
      }
      recalculate_doctor_average: {
        Args: { p_doctor_id: string }
        Returns: number
      }
      refresh_live_queue: {
        Args: { p_doctor_id: string; p_queue_date: string }
        Returns: undefined
      }
      release_slot: { Args: { p_lock_id: string }; Returns: undefined }
      reset_center_tokens: { Args: never; Returns: undefined }
      set_center_break: {
        Args: {
          p_break_end: string
          p_break_start: string
          p_center_id: string
          p_is_on_break: boolean
          p_queue_date: string
        }
        Returns: Json
      }
      staff_performance: {
        Args: { p_range: string }
        Returns: {
          avg_time_minutes: number
          completed_count: number
          staff_name: string
        }[]
      }
      start_service: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_time: string | null
          approved_at: string | null
          approved_by: string | null
          called_at: string | null
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_wait_mins: number | null
          id: string
          is_currently_serving: boolean | null
          notes: string | null
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_center_average_consultation_time: {
        Args: { p_avg_mins: number; p_center_id: string; p_queue_date: string }
        Returns: Json
      }
      update_user_fcm_token: { Args: { p_token: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
