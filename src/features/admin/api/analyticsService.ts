import { supabase } from '../../../lib/supabase';
import type { AppointmentStatus } from '../../../types/appointment';

export type DashboardStats = {
  totalAppointments: number;
  pendingCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  expiredCount: number;
  noShowCount: number;
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

export type RecentActivityItem = {
  id: string;
  action: string;
  createdAt: string;
  staffName?: string;
  tokenNumber?: number;
  oldStatus?: string;
  newStatus?: string;
};

export type SystemOverviewData = {
  totalCenters: number;
  totalServices: number;
  totalUsers: number;
  dbConnected: boolean;
};

export type AdminDashboardAnalytics = DashboardStats & {
  weeklyStats: WeeklyAppointmentStat[];
  statusDistribution: StatusDistributionStat[];
  recentActivity: RecentActivityItem[];
  systemOverview: SystemOverviewData;
};

const statusColors: Record<AppointmentStatus, string> = {
  pending: '#F59E0B',
  confirmed: '#2E7DFF',
  checked_in: '#10B981',
  called: '#8B5CF6',
  in_progress: '#3B82F6',
  completed: '#22C55E',
  cancelled: '#EF4444',
  expired: '#6B7280',
  no_show: '#EC4899',
  skipped: '#F97316',
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

const getRecentActivity = async (): Promise<RecentActivityItem[]> => {
  try {
    const { data: logs, error: logsError } = await supabase
      .from('audit_logs')
      .select(
        'id, staff_user_id, appointment_id, action, old_status, new_status, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(5);

    if (logsError) {
      console.error('[ANALYTICS] Failed to fetch audit logs:', {
        code: logsError.code,
        message: logsError.message,
        details: logsError.details,
      });
      throw logsError;
    }
    if (!logs || logs.length === 0) return [];

    const staffIds = [
      ...new Set(
        logs.map(log => log.staff_user_id).filter((id): id is string => !!id),
      ),
    ];
    const appointmentIds = [
      ...new Set(
        logs.map(log => log.appointment_id).filter((id): id is string => !!id),
      ),
    ];

    let profiles: any[] = [];
    if (staffIds.length > 0) {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', staffIds);
      if (profilesError) {
        console.warn(
          '[ANALYTICS] Failed to fetch staff profiles for activity:',
          {
            code: profilesError.code,
            message: profilesError.message,
            details: profilesError.details,
          },
        );
      }
      profiles = data || [];
    }

    let appointments: any[] = [];
    if (appointmentIds.length > 0) {
      const { data, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id, token_number')
        .in('id', appointmentIds);
      if (appointmentsError) {
        console.warn('[ANALYTICS] Failed to fetch appointments for activity:', {
          code: appointmentsError.code,
          message: appointmentsError.message,
          details: appointmentsError.details,
        });
      }
      appointments = data || [];
    }

    const staffNameMap = new Map(profiles.map(p => [p.id, p.full_name]));
    const tokenNumberMap = new Map(
      appointments.map(a => [a.id, a.token_number]),
    );

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      createdAt: log.created_at,
      staffName: log.staff_user_id
        ? staffNameMap.get(log.staff_user_id)
        : undefined,
      tokenNumber: log.appointment_id
        ? tokenNumberMap.get(log.appointment_id)
        : undefined,
      oldStatus: log.old_status ?? undefined,
      newStatus: log.new_status ?? undefined,
    }));
  } catch (error) {
    const err = error as {
      code?: string;
      message?: string;
      details?: string;
    } | null;
    console.error('[ANALYTICS] Error fetching recent activity:', {
      code: err?.code ?? 'UNKNOWN',
      message: err?.message ?? String(error),
      details: err?.details ?? null,
    });
    return [];
  }
};

const getSystemOverview = async (): Promise<SystemOverviewData> => {
  try {
    const [centersResult, servicesResult, usersResult] = await Promise.all([
      supabase
        .from('service_centers')
        .select('id', { count: 'exact', head: true }),
      supabase.from('services').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

    // Log any individual query errors without crashing the overview
    [centersResult, servicesResult, usersResult].forEach((result, idx) => {
      if (result.error) {
        const table = ['service_centers', 'services', 'profiles'][idx];
        console.warn(
          `[ANALYTICS] System overview count failed for table '${table}':`,
          {
            code: result.error.code,
            message: result.error.message,
            details: result.error.details,
          },
        );
      }
    });

    return {
      totalCenters: centersResult.count ?? 0,
      totalServices: servicesResult.count ?? 0,
      totalUsers: usersResult.count ?? 0,
      dbConnected: true,
    };
  } catch (error) {
    const err = error as {
      code?: string;
      message?: string;
      details?: string;
    } | null;
    console.error('[ANALYTICS] Error fetching system overview:', {
      code: err?.code ?? 'UNKNOWN',
      message: err?.message ?? String(error),
      details: err?.details ?? null,
    });
    return {
      totalCenters: 0,
      totalServices: 0,
      totalUsers: 0,
      dbConnected: false,
    };
  }
};

export const analyticsService = {
  async getDashboardStats(): Promise<AdminDashboardAnalytics> {
    try {
      await supabase.rpc('cleanup_stale_appointments');
    } catch (cleanupError) {
      const err = cleanupError as {
        code?: string;
        message?: string;
        details?: string;
      } | null;
      console.warn(
        '[ANALYTICS CLEANUP] Failed to trigger stale appointments cleanup:',
        {
          code: err?.code ?? 'UNKNOWN',
          message: err?.message ?? String(cleanupError),
          details: err?.details ?? null,
        },
      );
    }

    const todayKey = toDateKey(new Date());

    const [
      totalAppointments,
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      expiredCount,
      noShowCount,
      todayAppointments,
      weeklyStats,
      recentActivity,
      systemOverview,
    ] = await Promise.all([
      getAppointmentCount(),
      getAppointmentCount({ status: 'pending' }),
      getAppointmentCount({ status: 'confirmed' }),
      getAppointmentCount({ status: 'completed' }),
      getAppointmentCount({ status: 'cancelled' }),
      getAppointmentCount({ status: 'expired' }),
      getAppointmentCount({ status: 'no_show' }),
      getAppointmentCount({ appointmentDate: todayKey }),
      getWeeklyStats(),
      getRecentActivity(),
      getSystemOverview(),
    ]);

    return {
      totalAppointments,
      pendingCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      expiredCount,
      noShowCount,
      todayAppointments,
      weeklyStats,
      recentActivity,
      systemOverview,
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
        {
          name: 'Expired',
          count: expiredCount,
          color: statusColors.expired,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
        {
          name: 'No Show',
          count: noShowCount,
          color: statusColors.no_show,
          legendFontColor: '#64748B',
          legendFontSize: 12,
        },
      ],
    };
  },
};
