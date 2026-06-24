import { supabase } from '../../../lib/supabase';

type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type DashboardStats = {
  totalAppointments: number;
  pendingCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  todayAppointments: number;
};

export type WeeklyAppointmentStat = {
  date: string;
  label: string;
  count: number;
};

export type StatusDistributionStat = {
  name: string;
  count: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
};

export type AdminDashboardAnalytics = DashboardStats & {
  weeklyStats: WeeklyAppointmentStat[];
  statusDistribution: StatusDistributionStat[];
};

const statusColors: Record<AppointmentStatus, string> = {
  pending: '#F59E0B',
  confirmed: '#2E7DFF',
  completed: '#22C55E',
  cancelled: '#EF4444',
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatWeekday = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
  });

const getLastSevenDateKeys = () => {
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return toDateKey(date);
  });
};

const getAppointmentCount = async (filters?: {
  status?: AppointmentStatus;
  appointmentDate?: string;
}) => {
  let query = supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.appointmentDate) {
    query = query.eq('appointment_date', filters.appointmentDate);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

const getWeeklyStats = async (): Promise<WeeklyAppointmentStat[]> => {
  const dateKeys = getLastSevenDateKeys();
  const countsByDate = dateKeys.reduce<Record<string, number>>(
    (acc, dateKey) => {
      acc[dateKey] = 0;
      return acc;
    },
    {},
  );

  const { data, error } = await supabase
    .from('appointments')
    .select('appointment_date')
    .gte('appointment_date', dateKeys[0])
    .lte('appointment_date', dateKeys[dateKeys.length - 1]);

  if (error) {
    throw new Error(error.message);
  }

  data?.forEach(appointment => {
    const dateKey = appointment.appointment_date;
    if (dateKey && countsByDate[dateKey] !== undefined) {
      countsByDate[dateKey] += 1;
    }
  });

  return dateKeys.map(dateKey => ({
    date: dateKey,
    label: formatWeekday(dateKey),
    count: countsByDate[dateKey],
  }));
};

export const analyticsService = {
  async getDashboardStats(): Promise<AdminDashboardAnalytics> {
    const todayKey = toDateKey(new Date());

    const [
      totalAppointments,
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      todayAppointments,
      weeklyStats,
    ] = await Promise.all([
      getAppointmentCount(),
      getAppointmentCount({ status: 'pending' }),
      getAppointmentCount({ status: 'confirmed' }),
      getAppointmentCount({ status: 'completed' }),
      getAppointmentCount({ status: 'cancelled' }),
      getAppointmentCount({ appointmentDate: todayKey }),
      getWeeklyStats(),
    ]);

    return {
      totalAppointments,
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      todayAppointments,
      weeklyStats,
      statusDistribution: [
        {
          name: 'Pending',
          count: pendingCount,
          color: statusColors.pending,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
        {
          name: 'Confirmed',
          count: confirmedCount,
          color: statusColors.confirmed,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
        {
          name: 'Completed',
          count: completedCount,
          color: statusColors.completed,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
        {
          name: 'Cancelled',
          count: cancelledCount,
          color: statusColors.cancelled,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
      ],
    };
  },
};
