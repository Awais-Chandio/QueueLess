-- ============================================================
-- QueueLess Production Upgrade Migration
-- Phase 1: Notifications, Status History, Queue Logs, Auditing
-- ============================================================

-- 1. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'appointment_booked', 'queue_moved', 'appointment_completed', 'appointment_cancelled'
    title text NOT NULL,
    message text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE is_read = false;

-- 2. Appointment Status History Table
CREATE TABLE IF NOT EXISTS public.appointment_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    status text NOT NULL,
    notes text,
    changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own appointment history"
    ON public.appointment_status_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.appointments
            WHERE appointments.id = appointment_status_history.appointment_id
            AND appointments.user_id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_appointment_status_history_appt_id ON public.appointment_status_history(appointment_id);

-- 3. Queue Logs Table (Analytics)
CREATE TABLE IF NOT EXISTS public.queue_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    total_appointments integer DEFAULT 0,
    completed_appointments integer DEFAULT 0,
    cancelled_appointments integer DEFAULT 0,
    average_wait_mins integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(center_id, log_date)
);

ALTER TABLE public.queue_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view queue logs"
    ON public.queue_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE INDEX IF NOT EXISTS idx_queue_logs_center_date ON public.queue_logs(center_id, log_date);

-- 4. Trigger to automatically log appointment status changes
CREATE OR REPLACE FUNCTION public.log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
        INSERT INTO public.appointment_status_history (appointment_id, status, notes, changed_by)
        VALUES (NEW.id, NEW.status, NEW.notes, auth.uid());
        
        -- Also send a notification
        IF NEW.status = 'confirmed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_booked', 'Appointment Confirmed', 'Your appointment is confirmed.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_completed', 'Appointment Completed', 'Thank you for visiting.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'cancelled' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_cancelled', 'Appointment Cancelled', 'Your appointment has been cancelled.', jsonb_build_object('appointment_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_appointment_status_change ON public.appointments;
CREATE TRIGGER trigger_log_appointment_status_change
    AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.log_appointment_status_change();

-- 5. Trigger to auto-calculate queue metrics when an appointment is added or changes status
CREATE OR REPLACE FUNCTION public.update_queue_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_people_ahead integer;
    v_estimated_wait integer;
    v_avg_service_time integer := 15; -- Default 15 mins
BEGIN
    IF NEW.status = 'confirmed' THEN
        -- Calculate people ahead
        SELECT COUNT(*)
        INTO v_people_ahead
        FROM public.appointments
        WHERE center_id = NEW.center_id
          AND (scheduled_at AT TIME ZONE 'UTC')::date = (NEW.scheduled_at AT TIME ZONE 'UTC')::date
          AND status = 'confirmed'
          AND token_number < NEW.token_number;

        v_estimated_wait := v_people_ahead * v_avg_service_time;

        -- Check if we need to insert a queue update
        -- In a real production system, this might be handled by a CRON job or application layer,
        -- but for completeness, we log an update here.
        INSERT INTO public.queue_updates (appointment_id, current_position, people_ahead, estimated_wait_mins, status)
        VALUES (NEW.id, v_people_ahead + 1, v_people_ahead, v_estimated_wait, 'waiting')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

-- Note: We omit attaching update_queue_metrics to a trigger directly on every row update 
-- because it can be heavy. Usually, the application logic calls a stored procedure to advance the queue.

-- Add to Realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
