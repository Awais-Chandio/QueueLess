import { supabase } from '../../../lib/supabase'; // We'll need to create this or move from services/supabase/client.ts
import {
  getAppointmentDateTime,
  getAppointmentTimeLabel,
} from '../../appointments/utils/appointmentTime';

export const fetchDashboardStats = async (userId: string) => {
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(
      'id, center_id, status, scheduled_at, appointment_date, appointment_time, token_number, estimated_wait_mins',
    )
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(error.message);

  const now = new Date();
  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let totalWait = 0;

  appointments.forEach(app => {
    const appointmentDateTime = getAppointmentDateTime(app);
    const isQueueActive =
      app.status === 'checked_in' ||
      app.status === 'called' ||
      app.status === 'in_progress';
    const isUpcoming =
      (app.status === 'pending' || app.status === 'confirmed') &&
      appointmentDateTime.getTime() >= now.getTime();

    if (isQueueActive || isUpcoming) {
      active++;
      totalWait += isQueueActive
        ? app.estimated_wait_mins || 0
        : Math.max(
            0,
            Math.ceil((appointmentDateTime.getTime() - now.getTime()) / 60000),
          );
    }
    if (app.status === 'completed') completed++;
    if (app.status === 'cancelled') cancelled++;
  });

  const total = appointments.length;
  const avgWait = active > 0 ? Math.round(totalWait / active) : 0;
  const activeAppointment =
    appointments.find(
      appointment =>
        appointment.status === 'checked_in' ||
        appointment.status === 'called' ||
        appointment.status === 'in_progress',
    ) ??
    appointments.find(
      appointment =>
        (appointment.status === 'confirmed' ||
          appointment.status === 'pending') &&
        getAppointmentDateTime(appointment).getTime() >= now.getTime(),
    );
  const queueStatus =
    activeAppointment?.status === 'checked_in'
      ? 'Arrived at Clinic'
      : activeAppointment?.status === 'called' ||
        activeAppointment?.status === 'in_progress'
      ? 'Called'
      : activeAppointment
      ? `Scheduled for ${getAppointmentTimeLabel(activeAppointment)}`
      : null;

  console.log('[DASHBOARD] Patient queue status:', {
    userId,
    activeAppointmentId: activeAppointment?.id ?? null,
    appointmentStatus: activeAppointment?.status ?? null,
    queueStatus,
  });

  return {
    total,
    active,
    completed,
    cancelled,
    avgWait,
    queueStatus,
    activeAppointment: activeAppointment
      ? {
          id: activeAppointment.id,
          centerId: activeAppointment.center_id,
          scheduledAt: activeAppointment.scheduled_at,
          status: activeAppointment.status,
          tokenNumber: activeAppointment.token_number,
          appointmentDate: activeAppointment.appointment_date,
          appointmentTime: activeAppointment.appointment_time,
        }
      : null,
  };
};
