-- Migration: Replace appointment_date and appointment_time with scheduled_at (timestamptz)
-- This creates a production-ready datetime structure with timezone support

-- Step 1: Add the new scheduled_at column
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Step 2: Migrate existing data from appointment_date to scheduled_at
-- Assuming appointment_date is stored as a date string, we'll convert it to a timestamp
-- We'll use a default time of 09:00:00 for existing records since we don't have time data
UPDATE appointments 
SET scheduled_at = (appointment_date::date || ' 09:00:00')::timestamptz
WHERE scheduled_at IS NULL AND appointment_date IS NOT NULL;

-- Step 3: Make scheduled_at NOT NULL after migration is complete
ALTER TABLE appointments 
ALTER COLUMN scheduled_at SET NOT NULL;

-- Step 4: Drop the deprecated appointment_time column if it exists
ALTER TABLE appointments 
DROP COLUMN IF EXISTS appointment_time;

-- Step 5: Drop the deprecated appointment_date column after migration
ALTER TABLE appointments 
DROP COLUMN IF EXISTS appointment_date;

-- Step 6: Add an index on scheduled_at for better query performance
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);

-- Step 7: Add a comment to document the change
COMMENT ON COLUMN appointments.scheduled_at IS 'The scheduled date and time for the appointment (timezone-aware timestamp)';
