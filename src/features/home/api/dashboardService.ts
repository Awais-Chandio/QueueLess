import { supabase } from '../../../lib/supabase'; // We'll need to create this or move from services/supabase/client.ts

export const fetchDashboardStats = async (userId: string) => {
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, status, estimated_wait_mins')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let totalWait = 0;

  appointments.forEach(app => {
    if (app.status === 'pending' || app.status === 'confirmed') {
      active++;
      totalWait += app.estimated_wait_mins || 0;
    }
    if (app.status === 'completed') completed++;
    if (app.status === 'cancelled') cancelled++;
  });

  const total = appointments.length;
  const avgWait = active > 0 ? Math.round(totalWait / active) : 0;

  return {
    total,
    active,
    completed,
    cancelled,
    avgWait,
  };
};
