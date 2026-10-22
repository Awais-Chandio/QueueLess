import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { toastService } from '../../../services/toastService';
import { normalizeVisitSummary } from '../../../services/visitSummaryService';
import { visitSummaryKey } from '../../../hooks/useVisitSummary';
import type { SaveVisitSummaryPayload } from '../../../types/visitSummary';
import { toUserMessage } from '../../../utils/errorMessage';
import { queueRpc } from '../../queue/api/queueRpc';
import { useQueueRealtime } from '../../queue/hooks/useQueueRealtime';
import { splitTokens } from '../../queue/utils/queueState';

export type DoctorAction =
  | { kind: 'call_next' }
  | { kind: 'recall' | 'skip' | 'no_show'; appointmentId: string }
  | { kind: 'complete'; payload: SaveVisitSummaryPayload; callNext: boolean }
  | { kind: 'break'; onBreak: boolean }
  | { kind: 'late'; minutes: number };

export const doctorQueueKey = (doctorId: string | null | undefined) => ['doctor-queue', doctorId] as const;

/**
 * The doctor's own queue for today (get_doctor_queue: clinic's local day,
 * walk-in and QR guests included) and what the doctor can do with it.
 * Realtime on their appointments and doctor row, with a 20s poll behind it.
 */
export function useDoctorQueue() {
  const { doctorId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => doctorQueueKey(doctorId), [doctorId]);

  const query = useQuery({
    queryKey,
    queryFn: () => queueRpc.getDoctorQueue(doctorId!),
    enabled: !!doctorId,
    refetchInterval: 20_000,
    staleTime: 5_000,
  });

  const refetch = query.refetch;
  const onChange = useCallback(() => {
    refetch();
  }, [refetch]);
  useQueueRealtime({ doctorId, onChange });

  const mutation = useMutation({
    mutationFn: async (action: DoctorAction): Promise<string> => {
      const id = doctorId!;
      switch (action.kind) {
        case 'call_next': {
          const called = await queueRpc.callNext(id);
          return called ? `Token ${called.token_number} called in.` : 'Nobody is waiting.';
        }
        case 'recall':
          await queueRpc.recallToken(action.appointmentId);
          return 'Called again.';
        case 'skip':
          await queueRpc.skipToken(action.appointmentId);
          return 'Moved back in the line.';
        case 'no_show':
          await queueRpc.markNoShow(action.appointmentId);
          return 'Marked as no-show.';
        case 'complete': {
          const { diagnosis, notes, items } = normalizeVisitSummary(action.payload, { requireContent: false });
          await queueRpc.completeVisit({
            appointmentId: action.payload.appointmentId,
            diagnosis,
            notes,
            followUpDate: action.payload.followUpDate,
            items,
          });
          queryClient.invalidateQueries({ queryKey: visitSummaryKey(action.payload.appointmentId) });
          if (!action.callNext) return 'Visit completed.';
          const called = await queueRpc.callNext(id);
          return called ? `Visit completed. Token ${called.token_number} called in.` : 'Visit completed. Nobody is waiting.';
        }
        case 'break':
          await queueRpc.setDoctorBreak(id, action.onBreak);
          return action.onBreak ? 'Break started — patients can see it.' : 'Welcome back.';
        case 'late':
          await queueRpc.setDoctorLate(id, action.minutes);
          return action.minutes > 0 ? `Patients will see you're ${action.minutes} min late.` : 'Late notice cleared.';
      }
    },
    onSuccess: message => {
      toastService.success(message);
      queryClient.invalidateQueries({ queryKey: ['doctor-dashboard-extras'] });
      return queryClient.invalidateQueries({ queryKey });
    },
    onError: error => {
      toastService.error(toUserMessage(error, 'That didn’t work. Please try again.'));
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const tokens = query.data?.tokens;
  const split = useMemo(() => splitTokens(tokens ?? []), [tokens]);

  return {
    queue: query.data ?? null,
    doctor: query.data?.doctor ?? null,
    ...split,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    isError: query.isError,
    error: query.error,
    refetch,
    act: mutation.mutate,
    actAsync: mutation.mutateAsync,
    busy: mutation.isPending,
    pending: mutation.isPending ? mutation.variables : undefined,
  };
}
