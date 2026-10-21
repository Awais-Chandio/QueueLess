-- Migration: Add is_available column to doctor_schedules
-- Created: 2026-09-15
-- Purpose: doctor_schedules.slot_duration_minutes already exists but is unused
-- by the app's read/write path; is_available does not exist at all yet.
-- This migration adds is_available so the doctor "Off Day" toggle in the
-- Availability screen can persist instead of being silently discarded.

ALTER TABLE public.doctor_schedules
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.doctor_schedules.is_available IS
  'Whether the doctor accepts bookings on this day_of_week row. Off Day toggle in the doctor Availability screen writes this.';
