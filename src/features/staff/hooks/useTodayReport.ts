import { useQuery } from '@tanstack/react-query';
import { queueRpc } from '../../queue/api/queueRpc';

/**
 * Today's money for one center (get_payment_report, the clinic's day): the
 * owner home's cards and cash per receptionist. Refreshed by the reception
 * realtime nudge (the owner home invalidates it) and every 30s.
 */
export const useTodayReport = (centerId: string | null | undefined) =>
  useQuery({
    queryKey: ['today-report', centerId],
    queryFn: () => queueRpc.getTodayReport(centerId!),
    enabled: !!centerId,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
