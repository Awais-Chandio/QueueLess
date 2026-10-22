export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        ComputedFields: never
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
          patient_id: string
          public_code: string
          queue_position?: number | null
          scheduled_at: string
          service_id: string
          skipped_at?: string | null
          source?: string
          started_at?: string | null
          status?: string | null
          token_number: number
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
          patient_id?: string
          public_code?: string
          queue_position?: number | null
          scheduled_at?: string
          service_id?: string
          skipped_at?: string | null
          source?: string
          started_at?: string | null
          status?: string | null
          token_number?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
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
        ComputedFields: never
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
            foreignKeyName: 'audit_logs_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_logs_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_logs_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
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
        ComputedFields: never
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
            foreignKeyName: 'center_daily_tokens_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
        ]
      }
      center_displays: {
        Row: {
          center_id: string
          created_at: string
          display_key: string
          rotated_at: string | null
        }
        ComputedFields: never
        Insert: {
          center_id: string
          created_at?: string
          display_key?: string
          rotated_at?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          display_key?: string
          rotated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'center_displays_center_id_fkey'
            columns: ['center_id']
            isOneToOne: true
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
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
        ComputedFields: never
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
        Relationships: [
          {
            foreignKeyName: 'center_queue_settings_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
        ]
      }
      device_tokens: {
        Row: {
          fcm_token: string
          id: string
          platform: string | null
          updated_at: string | null
          user_id: string
        }
        ComputedFields: never
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
        ComputedFields: never
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
            foreignKeyName: 'doctor_leaves_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
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
        ComputedFields: never
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
      doctor_reviews: {
        Row: {
          appointment_id: string
          comment: string | null
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          rating: number
        }
        ComputedFields: never
        Insert: {
          appointment_id: string
          comment?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          rating: number
        }
        Update: {
          appointment_id?: string
          comment?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: 'doctor_reviews_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'doctor_reviews_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'doctor_reviews_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'doctor_reviews_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
        ]
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
        ComputedFields: never
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
            foreignKeyName: 'doctor_schedules_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
        ]
      }
      doctor_services: {
        Row: {
          doctor_id: string
          service_id: string
        }
        ComputedFields: never
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
            foreignKeyName: 'doctor_services_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'doctor_services_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['id']
          },
        ]
      }
      doctors: {
        Row: {
          avg_rating: number | null
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
          late_until: string | null
          license_number: string | null
          name: string
          photo_url: string | null
          profile_id: string | null
          qualification: string | null
          review_count: number
          room: string | null
          specialty: string
          status: string | null
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          avg_rating?: number | null
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
          late_until?: string | null
          license_number?: string | null
          name: string
          photo_url?: string | null
          profile_id?: string | null
          qualification?: string | null
          review_count?: number
          room?: string | null
          specialty: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_rating?: number | null
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
          late_until?: string | null
          license_number?: string | null
          name?: string
          photo_url?: string | null
          profile_id?: string | null
          qualification?: string | null
          review_count?: number
          room?: string | null
          specialty?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'doctors_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'doctors_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      message_credits: {
        Row: {
          balance: number
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          balance?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_credits_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: true
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      message_log: {
        Row: {
          appointment_id: string | null
          channel: string
          cost: number
          created_at: string
          error: string | null
          id: string
          organization_id: string
          provider_message_id: string | null
          refunded_at: string | null
          status: string
          template: string
          to_phone: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          appointment_id?: string | null
          channel: string
          cost?: number
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          provider_message_id?: string | null
          refunded_at?: string | null
          status?: string
          template: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          channel?: string
          cost?: number
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          provider_message_id?: string | null
          refunded_at?: string | null
          status?: string
          template?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_log_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_log_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_log_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_log_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      notification_outbox: {
        Row: {
          appointment_id: string | null
          attempts: number
          channel: string | null
          created_at: string
          dedupe_key: string
          event: string
          id: string
          language: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          message_log_id: string | null
          next_attempt_at: string
          organization_id: string
          payload: NonNullable<Json>
          provider_message_id: string | null
          sent_at: string | null
          status: string
          to_phone: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          appointment_id?: string | null
          attempts?: number
          channel?: string | null
          created_at?: string
          dedupe_key: string
          event: string
          id?: string
          language: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          message_log_id?: string | null
          next_attempt_at?: string
          organization_id: string
          payload?: NonNullable<Json>
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          channel?: string | null
          created_at?: string
          dedupe_key?: string
          event?: string
          id?: string
          language?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          message_log_id?: string | null
          next_attempt_at?: string
          organization_id?: string
          payload?: NonNullable<Json>
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_outbox_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_outbox_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_outbox_message_log_id_fkey'
            columns: ['message_log_id']
            isOneToOne: false
            referencedRelation: 'message_log'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_outbox_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
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
        ComputedFields: never
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
      org_entitlements: {
        Row: {
          max_centers: number | null
          max_doctors: number | null
          modules: string[]
          organization_id: string
          plan_id: string
          tokens_per_day: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          max_centers?: number | null
          max_doctors?: number | null
          modules: string[]
          organization_id: string
          plan_id: string
          tokens_per_day?: number | null
          updated_at?: string
        }
        Update: {
          max_centers?: number | null
          max_doctors?: number | null
          modules?: string[]
          organization_id?: string
          plan_id?: string
          tokens_per_day?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_entitlements_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: true
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_entitlements_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          center_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          center_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          center_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_invites_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_invites_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_members_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      org_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          organization_id: string
          plan_id: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_subscriptions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_legacy: boolean
          message_language: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          is_legacy?: boolean
          message_language?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_legacy?: boolean
          message_language?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          phone: string | null
          preferred_language: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          preferred_language?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          preferred_language?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'patients_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          max_centers: number | null
          max_doctors: number | null
          modules: string[]
          monthly_message_credits: number
          monthly_price_pkr: number | null
          name: string
          sort_order: number
          tokens_per_day: number | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id: string
          is_public?: boolean
          max_centers?: number | null
          max_doctors?: number | null
          modules?: string[]
          monthly_message_credits?: number
          monthly_price_pkr?: number | null
          name: string
          sort_order?: number
          tokens_per_day?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          max_centers?: number | null
          max_doctors?: number | null
          modules?: string[]
          monthly_message_credits?: number
          monthly_price_pkr?: number | null
          name?: string
          sort_order?: number
          tokens_per_day?: number | null
        }
        Relationships: []
      }
      prescription_items: {
        Row: {
          dosage: string
          duration: string
          frequency: string
          id: string
          instructions: string | null
          medicine_name: string
          sort_order: number
          visit_summary_id: string
        }
        ComputedFields: never
        Insert: {
          dosage: string
          duration: string
          frequency: string
          id?: string
          instructions?: string | null
          medicine_name: string
          sort_order?: number
          visit_summary_id: string
        }
        Update: {
          dosage?: string
          duration?: string
          frequency?: string
          id?: string
          instructions?: string | null
          medicine_name?: string
          sort_order?: number
          visit_summary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'prescription_items_visit_summary_id_fkey'
            columns: ['visit_summary_id']
            isOneToOne: false
            referencedRelation: 'visit_summaries'
            referencedColumns: ['id']
          },
        ]
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
        ComputedFields: never
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
            foreignKeyName: 'profiles_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
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
        ComputedFields: never
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
            foreignKeyName: 'queue_updates_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'queue_updates_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'queue_updates_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
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
          organization_id: string
          slug: string
        }
        ComputedFields: never
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
          organization_id: string
          slug: string
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
          organization_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'service_centers_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
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
        ComputedFields: never
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
            foreignKeyName: 'center_services_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
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
        ComputedFields: never
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
            foreignKeyName: 'slot_locks_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'slot_locks_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
        ]
      }
      staff_centers: {
        Row: {
          center_id: string
          created_at: string
          profile_id: string
        }
        ComputedFields: never
        Insert: {
          center_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_centers_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staff_centers_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      visit_summaries: {
        Row: {
          appointment_id: string
          created_at: string
          diagnosis: string | null
          doctor_id: string
          follow_up_date: string | null
          id: string
          notes: string | null
          patient_id: string | null
          patient_record_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          appointment_id: string
          created_at?: string
          diagnosis?: string | null
          doctor_id: string
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_record_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visit_summaries_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_summaries_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'appointments_full'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_summaries_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: true
            referencedRelation: 'queue_view'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_summaries_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_summaries_patient_record_id_fkey'
            columns: ['patient_record_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
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
          patient_id: string | null
          patient_name: string | null
          people_ahead: number | null
          public_code: string | null
          queue_position: number | null
          queue_status: string | null
          scheduled_at: string | null
          service_id: string | null
          service_name: string | null
          skipped_at: string | null
          source: string | null
          started_at: string | null
          status: string | null
          token_number: number | null
          user_id: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: 'appointments_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_doctor_id_fkey'
            columns: ['doctor_id']
            isOneToOne: false
            referencedRelation: 'doctors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
        ]
      }
      current_token_view: {
        Row: {
          current_token: number | null
        }
        ComputedFields: never
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
        ComputedFields: never
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
        Relationships: [
          {
            foreignKeyName: 'appointments_center_id_fkey'
            columns: ['center_id']
            isOneToOne: false
            referencedRelation: 'service_centers'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      accept_invites: { Args: Record<PropertyKey, never>; Returns: number }
      admin_delete_staff_account: { Args: { staff_profile_id: string }; Returns: undefined }
      begin_notification_send: { Args: { p_channel: string; p_cost: number; p_outbox_id: string }; Returns: Json }
      book_appointment: { Args: { p_lock_id: string; p_notes?: string; p_service_id: string }; Returns: string }
      bookings_per_day: {
        Args: { p_range: string }
        Returns: {
          booking_date: string
          count: number
        }[]
      }
      busiest_centers: {
        Args: { p_range: string }
        Returns: {
          center_name: string
          count: number
        }[]
      }
      busiest_services: {
        Args: { p_range: string }
        Returns: {
          count: number
          service_name: string
        }[]
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      call_next: {
        Args: { p_doctor_id: string }
        Returns: {
          appointment_id: string
          patient_name: string
          token_number: number
        }[]
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      charge_message_credits: {
        Args: {
          p_appointment_id?: string
          p_channel: string
          p_cost: number
          p_organization_id: string
          p_template: string
          p_to_phone: string
        }
        Returns: string
      }
      check_in_appointment: { Args: { p_appointment_id: string }; Returns: undefined }
      claim_notifications: {
        Args: { p_limit?: number; p_lock_seconds?: number }
        Returns: {
          appointment_id: string
          attempts: number
          channel: string
          event: string
          id: string
          language: string
          max_attempts: number
          message_log_id: string
          modules: string[]
          organization_id: string
          payload: Json
          to_phone: string
        }[]
      }
      cleanup_stale_appointments: { Args: Record<PropertyKey, never>; Returns: Json }
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_visit: {
        Args: {
          p_appointment_id: string
          p_diagnosis?: string
          p_follow_up_date?: string
          p_items?: Json
          p_notes?: string
        }
        Returns: Json
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
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
      create_organization: {
        Args: {
          p_address: string
          p_center_name: string
          p_city: string
          p_close_time?: string
          p_doctors?: Json
          p_open_time?: string
          p_org_name: string
          p_timezone?: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      finish_notification_send: {
        Args: {
          p_error?: string
          p_ok: boolean
          p_outbox_id: string
          p_provider_message_id?: string
          p_retryable?: boolean
        }
        Returns: string
      }
      generate_token_number: { Args: { p_center_id: string }; Returns: number }
      get_appointment_queue_snapshot: { Args: { p_appointment_id: string }; Returns: Json }
      get_available_slots: { Args: { p_date: string; p_doctor_id: string }; Returns: string[] }
      get_center_queue_snapshot: { Args: { p_center_id: string; p_queue_date?: string }; Returns: Json }
      get_current_token:
        | { Args: Record<PropertyKey, never>; Returns: number }
        | { Args: { p_center_id: string; p_queue_date?: string }; Returns: number }
      get_display_snapshot: { Args: { p_display_key: string }; Returns: Json }
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
      get_doctor_queue: { Args: { p_doctor_id: string }; Returns: Json }
      get_doctor_queue_snapshot: { Args: { p_doctor_id: string; p_queue_date?: string }; Returns: Json }
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
        Args: Record<PropertyKey, never>
        Returns: {
          doctor_id: string
          is_doctor: boolean
          role: string
        }[]
      }
      get_my_workspaces: { Args: Record<PropertyKey, never>; Returns: Json }
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
      get_next_token: { Args: { p_appointment_date: string; p_center_id: string }; Returns: number }
      get_org_settings: { Args: { p_org_id: string }; Returns: Json }
      get_public_center: { Args: { p_slug: string }; Returns: Json }
      get_reception_queue: { Args: { p_center_id: string }; Returns: Json }
      get_token_status: {
        Args: { p_public_code: string }
        Returns: {
          current_token: number
          doctor_late_until: string
          doctor_name: string
          doctor_on_break: boolean
          eta_minutes: number
          people_ahead: number
          status: string
          token_number: number
        }[]
      }
      get_user_role: { Args: Record<PropertyKey, never>; Returns: string }
      invite_staff: { Args: { p_center_id: string; p_email: string }; Returns: string }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_doctor: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      issue_public_token: {
        Args: { p_center_slug?: string; p_doctor_id: string; p_name: string; p_phone: string; p_source?: string }
        Returns: {
          appointment_id: string
          eta_minutes: number
          people_ahead: number
          public_code: string
          token_number: number
        }[]
      }
      issue_token: {
        Args: { p_doctor_id: string; p_name: string; p_phone: string; p_source?: string }
        Returns: {
          appointment_id: string
          eta_minutes: number
          people_ahead: number
          public_code: string
          token_number: number
        }[]
      }
      lock_slot: { Args: { p_center_id: string; p_date: string; p_doctor_id: string; p_time: string }; Returns: string }
      mark_no_show: { Args: { p_appointment_id: string }; Returns: undefined }
      people_ahead:
        | { Args: { my_token: number }; Returns: number }
        | { Args: { p_appointment_id: string }; Returns: number }
      queue_appointment_date: { Args: { p_appointment_date: string; p_scheduled_at: string }; Returns: string }
      recalculate_doctor_average: { Args: { p_doctor_id: string }; Returns: number }
      recall_token: { Args: { p_appointment_id: string }; Returns: undefined }
      refresh_live_queue: { Args: { p_doctor_id: string; p_queue_date: string }; Returns: undefined }
      release_slot: { Args: { p_lock_id: string }; Returns: undefined }
      remove_staff: { Args: { p_center_id: string; p_user_id: string }; Returns: undefined }
      reset_center_tokens: { Args: Record<PropertyKey, never>; Returns: undefined }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      rotate_display_key: { Args: { p_center_id: string }; Returns: string }
      save_visit_summary: {
        Args: {
          p_appointment_id: string
          p_diagnosis: string
          p_follow_up_date: string
          p_items: Json
          p_notes: string
        }
        Returns: string
      }
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
      set_doctor_break: { Args: { p_doctor_id: string; p_on_break: boolean }; Returns: undefined }
      set_doctor_late: { Args: { p_doctor_id: string; p_minutes: number }; Returns: string }
      set_token_language: { Args: { p_language: string; p_public_code: string }; Returns: undefined }
      skip_notification: { Args: { p_outbox_id: string; p_reason: string }; Returns: undefined }
      skip_token: { Args: { p_appointment_id: string }; Returns: undefined }
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
          patient_id: string
          public_code: string
          queue_position: number | null
          scheduled_at: string
          service_id: string
          skipped_at: string | null
          source: string
          started_at: string | null
          status: string | null
          token_number: number
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_center: {
        Args: {
          p_address: string
          p_center_id: string
          p_city: string
          p_close_time: string
          p_name: string
          p_open_time: string
        }
        Returns: undefined
      }
      update_center_average_consultation_time: {
        Args: { p_avg_mins: number; p_center_id: string; p_queue_date: string }
        Returns: Json
      }
      update_user_fcm_token: { Args: { p_token: string }; Returns: undefined }
      upsert_doctor: {
        Args: {
          p_average_minutes?: number
          p_center_id: string
          p_doctor_id: string
          p_is_active?: boolean
          p_name: string
          p_room: string
          p_specialty: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
  ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
  ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
