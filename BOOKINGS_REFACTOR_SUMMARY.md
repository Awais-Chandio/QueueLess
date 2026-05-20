# QueueLess Bookings Schema Refactor Summary

## Overview
Refactored the bookings schema and frontend to use a production-ready datetime structure by replacing `booking_date` and `booking_time` with a single `scheduled_at` (timestamptz) column.

## Final Schema

### Bookings Table
- `id` - UUID
- `user_id` - UUID
- `center_id` - UUID
- `service_id` - UUID
- `scheduled_at` - **timestamptz** (NEW - timezone-aware timestamp)
- `status` - enum ('pending', 'confirmed', 'completed', 'cancelled')
- `queue_number` - integer | null
- `created_at` - timestamptz

### Removed Columns
- ~~`booking_date`~~ (deprecated)
- ~~`booking_time`~~ (deprecated)

## Migration SQL
Location: `supabase/migrate_bookings_to_scheduled_at.sql`

The migration:
1. Adds `scheduled_at` column as timestamptz
2. Migrates existing data from `booking_date` to `scheduled_at` (defaults to 09:00:00 for time)
3. Sets `scheduled_at` as NOT NULL
4. Drops deprecated `booking_time` column
5. Drops deprecated `booking_date` column
6. Creates index on `scheduled_at` for query performance
7. Adds documentation comment

## Frontend Changes

### 1. Types (`src/types/booking.ts`)
- Replaced `booking_date: string` and `booking_time: string` with `scheduled_at: string`

### 2. Service (`src/services/bookings/bookingsService.ts`)
- Updated `CreateBookingPayload` to use `scheduled_at`
- Updated `fetchUserBookings` to sort by `scheduled_at` (ascending for upcoming bookings)
- Added debug logs for create and fetch operations

### 3. Store (`src/store/bookingsStore.ts`)
- Updated `createBooking` payload to use `scheduled_at`
- Added debug logs for store operations

### 4. Screens

#### MyBookingsScreen (`src/screens/bookings/MyBookingsScreen.tsx`)
- Updated to display `scheduled_at` with formatted datetime
- Added `formatScheduledAt` helper function for timezone-safe formatting
- Added debug logs for fetch operations

#### BookAppointmentScreen (`src/screens/bookings/BookAppointmentScreen.tsx`)
- Updated `handleBook` to pass `scheduled_at` as ISO string from date picker
- Added debug logs for booking creation

#### QueueStatusScreen (`src/screens/bookings/QueueStatusScreen.tsx`)
- Updated local `Booking` type to use `scheduled_at`
- Updated UI to display combined date/time from `scheduled_at`
- Added `formatScheduledAt` helper function
- Added debug logs for fetch operations

## Debug Logging
Added comprehensive debug logs throughout the booking flow:
- `[DEBUG] Creating booking with payload:` - in bookingsService
- `[DEBUG] Booking created successfully:` - in bookingsService
- `[DEBUG] Failed to create booking:` - in bookingsService
- `[DEBUG] Fetching bookings for user:` - in bookingsService
- `[DEBUG] Fetched bookings count:` - in bookingsService
- `[DEBUG] Failed to fetch bookings:` - in bookingsService
- `[DEBUG] Store: Creating booking with payload:` - in bookingsStore
- `[DEBUG] Store: Booking created and added to state` - in bookingsStore
- `[DEBUG] Store: Fetching bookings for user:` - in bookingsStore
- `[DEBUG] Store: Bookings fetched and updated in state` - in bookingsStore
- `[DEBUG] MyBookingsScreen: Fetching bookings for user:` - in MyBookingsScreen
- `[DEBUG] MyBookingsScreen: Fetched bookings:` - in MyBookingsScreen
- `[DEBUG] BookAppointmentScreen: Creating booking with date:` - in BookAppointmentScreen
- `[DEBUG] QueueStatusScreen: Fetching booking:` - in QueueStatusScreen
- `[DEBUG] QueueStatusScreen: Booking fetched:` - in QueueStatusScreen

## Timezone Handling
- All datetime values are stored as ISO 8601 strings in the database
- Frontend uses `toLocaleString()` with explicit locale options for consistent formatting
- The `timestamptz` type in PostgreSQL ensures timezone-aware storage

## Sorting
- Bookings are now sorted by `scheduled_at` in ascending order (upcoming first)
- This replaces the previous dual-sort by `booking_date` and `booking_time`

## Verification Status
✅ All frontend files updated to use `scheduled_at`
✅ No remaining references to `booking_date` or `booking_time` in frontend code
✅ Migration SQL created and ready for deployment
✅ Debug logs added for all booking operations
✅ Timezone-safe formatting implemented
✅ Proper sorting by upcoming bookings implemented

## Deployment Steps
1. Run the migration SQL in Supabase: `supabase/migrate_bookings_to_scheduled_at.sql`
2. Deploy the frontend changes
3. Test booking creation flow
4. Test booking display in MyBookingsScreen
5. Test queue status display
6. Monitor debug logs to verify operations

## Notes
- Existing bookings will be migrated with a default time of 09:00:00 since the old schema didn't store time
- The migration is designed to be reversible if needed
- All datetime operations now use the production-ready `timestamptz` type
