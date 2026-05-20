-- Migration: Replace booking_date and booking_time with scheduled_at (timestamptz)
-- This creates a production-ready datetime structure with timezone support

-- Step 1: Add the new scheduled_at column
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Step 2: Migrate existing data from booking_date to scheduled_at
-- Assuming booking_date is stored as a date string, we'll convert it to a timestamp
-- We'll use a default time of 09:00:00 for existing records since we don't have time data
UPDATE bookings 
SET scheduled_at = (booking_date::date || ' 09:00:00')::timestamptz
WHERE scheduled_at IS NULL AND booking_date IS NOT NULL;

-- Step 3: Make scheduled_at NOT NULL after migration is complete
ALTER TABLE bookings 
ALTER COLUMN scheduled_at SET NOT NULL;

-- Step 4: Drop the deprecated booking_time column if it exists
ALTER TABLE bookings 
DROP COLUMN IF EXISTS booking_time;

-- Step 5: Drop the deprecated booking_date column after migration
ALTER TABLE bookings 
DROP COLUMN IF EXISTS booking_date;

-- Step 6: Add an index on scheduled_at for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON bookings(scheduled_at);

-- Step 7: Add a comment to document the change
COMMENT ON COLUMN bookings.scheduled_at IS 'The scheduled date and time for the booking (timezone-aware timestamp)';
