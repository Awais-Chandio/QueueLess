import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import type { PlanSummary } from '../../queue/api/queueRpc';
import type { PlanStatus } from '../modules';

export type ClinicInsights = {
  today: string;
  totals: { tokens: number; seen: number; missed: number; avg_wait_minutes: number | null; avg_consult_minutes: number | null };
  busiest_hour: number | null;
};

/** The clinic's current plan (org_entitlements is readable by its members). */
export const useOrgPlan = (organizationId: string | null | undefined) =>
  useQuery({
    queryKey: ['org-plan', organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanSummary | null> => {
      const { data, error } = await supabase
        .from('org_entitlements')
        .select('plan_id, modules, tokens_per_day')
        .eq('organization_id', organizationId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.plan_id, modules: data.modules, tokens_per_day: data.tokens_per_day } : null;
    },
  });

/** Last 7 days for one center (analytics module; the server refuses without it). */
export const useClinicInsights = (centerId: string | null | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['clinic-insights', centerId],
    enabled: !!centerId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ClinicInsights> => {
      const { data, error } = await supabase.rpc('get_clinic_insights', { p_center_id: centerId!, p_days: 7 });
      if (error) throw new Error(error.message);
      return data as unknown as ClinicInsights;
    },
  });

/** The plan and its banner (get_plan_status: any member of the clinic). */
export const usePlanStatus = (organizationId: string | null | undefined) =>
  useQuery({
    queryKey: ['plan-status', organizationId],
    enabled: !!organizationId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlanStatus | null> => {
      const { data, error } = await supabase.rpc('get_plan_status', { p_org_id: organizationId! });
      if (error) throw new Error(error.message);
      return (data as unknown as PlanStatus) ?? null;
    },
  });
