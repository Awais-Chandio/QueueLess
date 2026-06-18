import { supabase } from '../../../lib/supabase';

export type AdminSummary = {
  centers: number;
  services: number;
  users: number;
  appointments: number;
};

const getCount = async (table: string) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

export const adminService = {
  async fetchSummary(): Promise<AdminSummary> {
    const [centers, services, users, appointments] = await Promise.all([
      getCount('service_centers'),
      getCount('services'),
      getCount('profiles'),
      getCount('appointments'),
    ]);

    return {
      centers,
      services,
      users,
      appointments,
    };
  },
};
