import { supabase } from '../../../lib/supabase'; // We'll need to create this or move from services/supabase/client.ts

export const fetchDashboardStats = async (userId: string) => {
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, status, scheduled_at, estimated_wait_mins')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(error.message);

  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let totalWait = 0;

  appointments.forEach(app => {
    if (
      app.status === 'pending' ||
      app.status === 'confirmed' ||
      app.status === 'checked_in'
    ) {
      active++;
      totalWait += app.estimated_wait_mins || 0;
    }
    if (app.status === 'completed') completed++;
    if (app.status === 'cancelled') cancelled++;
  });

  const total = appointments.length;
  const avgWait = active > 0 ? Math.round(totalWait / active) : 0;
  const activeAppointment = appointments.find(
    appointment => appointment.status === 'checked_in',
  ) ?? appointments.find(
    appointment =>
      appointment.status === 'confirmed' ||
      appointment.status === 'pending',
  );
  const queueStatus =
    activeAppointment?.status === 'checked_in'
      ? 'Arrived at Clinic'
      : activeAppointment
        ? 'Waiting'
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
  };
};
