-- QueueLess Notifications Customization
-- Run this in Supabase SQL Editor to send specific notifications based on appointment status

CREATE OR REPLACE FUNCTION public.log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Log the status change into history
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
        INSERT INTO public.appointment_status_history (appointment_id, status, notes, changed_by)
        VALUES (NEW.id, NEW.status, NEW.notes, auth.uid());
        
        -- Send specific notifications based on the exact status
        IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_booked', 'Appointment Booked', 'Your appointment has been successfully booked and is pending confirmation.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'confirmed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_confirmed', 'Appointment Confirmed', 'Your appointment has been confirmed by the staff.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'called' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'token_called', 'Token Called', 'It''s your turn! Please proceed to the counter.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_completed', 'Appointment Completed', 'Thank you for visiting. Your appointment is complete.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'cancelled' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_cancelled', 'Appointment Cancelled', 'Your appointment has been cancelled by the staff.', jsonb_build_object('appointment_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
