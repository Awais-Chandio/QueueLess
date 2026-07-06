import { supabase } from '../lib/supabase';
import type { AppointmentFull, AppointmentStatus } from '../types/appointment';

export const getNextToken = async (
  centerId: string,
  appointmentDate: string,
): Promise<number> => {
  if (!centerId || !appointmentDate) {
    throw new Error('Center ID and appointment date are required for token allocation.');
  }

  const { data, error } = await supabase.rpc('get_next_token', {
    p_center_id: centerId,
    p_appointment_date: appointmentDate,
  });

  if (error) {
    console.error('[BOOKING_SERVICE] Failed to allocate token via RPC:', error);
    throw new Error(error.message);
  }

  return data as number;
};

export const getAppointmentStatusState = (
  appointment: AppointmentFull,
  now = new Date(),
) => {
  const scheduledTime = new Date(appointment.scheduled_at).getTime();

  // Default to 30 mins duration if no estimate available
  const durationMins = appointment.estimated_wait_mins || 30;
  const expiredTime = scheduledTime + durationMins * 60 * 1000;
  const noShowTime = scheduledTime + 15 * 60 * 1000; // 15 mins check-in grace period

  const status = appointment.status;

  const isExpired =
    status === 'expired' ||
    ((status === 'pending' ||
      status === 'confirmed' ||
      status === 'checked_in' ||
      status === 'called' ||
      status === 'in_progress') &&
      now.getTime() > expiredTime);

  const isNoShow =
    status === 'no_show' ||
    (status === 'confirmed' &&
      now.getTime() > noShowTime &&
      !appointment.checked_in_at);

  // If it's technically expired or no-show, it shouldn't be counted as active
  const isActiveBooking =
    (status === 'pending' ||
      status === 'confirmed' ||
      status === 'checked_in' ||
      status === 'called' ||
      status === 'in_progress') &&
    !isExpired &&
    !isNoShow;

  const isPastBooking =
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'skipped' ||
    status === 'expired' ||
    status === 'no_show' ||
    isExpired ||
    isNoShow;

  // Resolve status string for UI display
  let resolvedStatus: AppointmentStatus = status;
  const statusStr = status as string;
  if (isNoShow && statusStr !== 'cancelled' && statusStr !== 'completed') {
    resolvedStatus = 'no_show';
  } else if (
    isExpired &&
    statusStr !== 'cancelled' &&
    statusStr !== 'completed'
  ) {
    resolvedStatus = 'expired';
  }

  return {
    isExpired,
    isNoShow,
    isActiveBooking,
    isPastBooking,
    resolvedStatus,
  };
};

export const getStatusDisplayProperties = (status: AppointmentStatus) => {
  switch (status) {
    case 'completed':
      return { label: 'Completed', variant: 'success' as const };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'error' as const };
    case 'expired':
      return { label: 'Expired', variant: 'error' as const };
    case 'no_show':
      return { label: 'No Show', variant: 'error' as const };
    case 'skipped':
      return { label: 'Skipped', variant: 'error' as const };
    case 'checked_in':
      return { label: 'Checked In', variant: 'success' as const };
    case 'called':
    case 'in_progress':
      return { label: 'Calling / Serving', variant: 'info' as const };
    case 'confirmed':
      return { label: 'Confirmed', variant: 'info' as const };
    case 'pending':
    default:
      return { label: 'Pending', variant: 'warning' as const };
  }
};
