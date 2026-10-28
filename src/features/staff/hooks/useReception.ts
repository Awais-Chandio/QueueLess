import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { toastService } from '../../../services/toastService';
import { toUserMessage } from '../../../utils/errorMessage';
import { queueRpc, type IssuedToken, type WalkInInput, type Workspace } from '../../queue/api/queueRpc';
import { useQueueRealtime } from '../../queue/hooks/useQueueRealtime';
import { isPlanLimitError } from '../../plans/modules';
import type { FeeAction } from '../components/Fees';
import { METHOD_LABEL, formatRs, walkInMessage } from '../utils/fees';

export type DeskCenter = { id: string; name: string; organizationId: string; organizationName: string; isOwner: boolean };

/** Centers this user can run the desk for (owner: all of the clinic's; receptionist: assigned ones). */
export const deskCenters = (workspaces: Workspace[]): DeskCenter[] =>
  workspaces
    .filter(w => w.roles.some(role => role === 'owner' || role === 'receptionist'))
    .flatMap(w =>
      w.centers.map(center => ({
        id: center.id,
        name: center.name,
        organizationId: w.organization_id,
        organizationName: w.organization_name,
        isOwner: w.roles.includes('owner'),
      })),
    );

export type Action =
  | { kind: 'call_next'; doctorId: string }
  | { kind: 'recall' | 'skip' | 'no_show'; appointmentId: string }
  | { kind: 'break'; doctorId: string; onBreak: boolean }
  | { kind: 'late'; doctorId: string; minutes: number }
  | ({ kind: 'walk_in' } & WalkInInput)
  | FeeAction;

const run = async (action: Action) => {
  switch (action.kind) {
    case 'call_next':
      return queueRpc.callNext(action.doctorId);
    case 'recall':
      return queueRpc.recallToken(action.appointmentId);
    case 'skip':
      return queueRpc.skipToken(action.appointmentId);
    case 'no_show':
      return queueRpc.markNoShow(action.appointmentId);
    case 'break':
      return queueRpc.setDoctorBreak(action.doctorId, action.onBreak);
    case 'late':
      return queueRpc.setDoctorLate(action.doctorId, action.minutes);
    case 'walk_in':
      return queueRpc.issueWalkIn({
        doctorId: action.doctorId,
        name: action.name,
        phone: action.phone,
        feeReceived: action.feeReceived,
        amount: action.amount,
        method: action.method,
      });
    case 'pay':
      return queueRpc.recordPayment(action.appointmentId, action.amount, action.method);
    case 'waive':
      return queueRpc.waiveFee(action.appointmentId, action.reason);
    case 'verify':
      return queueRpc.verifyClaim(action.paymentId, true);
    case 'reject':
      return queueRpc.verifyClaim(action.paymentId, false, action.reason);
  }
};

const successMessage = (action: Action, result: unknown) => {
  switch (action.kind) {
    case 'call_next': {
      const called = result as { token_number: number; patient_name: string | null } | null;
      return called ? `Token ${called.token_number} called${called.patient_name ? ` · ${called.patient_name}` : ''}` : 'Nobody is waiting.';
    }
    case 'walk_in':
      return walkInMessage(result as IssuedToken, action.amount, action.method);
    case 'pay':
      return `Token ${action.tokenNumber}: ${formatRs(action.amount)} ${METHOD_LABEL[action.method]} received. In the line.`;
    case 'waive':
      return `Token ${action.tokenNumber}: free visit. In the line.`;
    case 'verify':
      return `Token ${action.tokenNumber}: payment verified. In the line.`;
    case 'reject':
      return `Token ${action.tokenNumber}: payment rejected. The patient sees why.`;
    case 'recall':
      return 'Called again.';
    case 'skip':
      return 'Moved back in the line.';
    case 'no_show':
      return 'Marked as no-show.';
    case 'break':
      return action.onBreak ? 'Break started.' : 'Break ended.';
    case 'late':
      return action.minutes > 0 ? `Running ${action.minutes} min late — patients will see it.` : 'Late notice cleared.';
  }
};

/** The desk: centers, today's queue for the selected center (realtime + 20s poll), and the actions. */
export const useReception = () => {
  const queryClient = useQueryClient();
  const workspaces = useAuthStore(state => state.workspaces);
  const centers = useMemo(() => deskCenters(workspaces), [workspaces]);
  const storedCenterId = useWorkspaceStore(state => state.centerId);
  const setCenterId = useWorkspaceStore(state => state.setCenterId);
  const center = centers.find(c => c.id === storedCenterId) ?? centers[0] ?? null;
  const queryKey = useMemo(() => ['reception', center?.id] as const, [center?.id]);

  const query = useQuery({
    queryKey,
    queryFn: () => queueRpc.getReceptionQueue(center!.id),
    enabled: !!center,
    refetchInterval: 20_000,
    staleTime: 5_000,
  });

  const refetch = query.refetch;
  const onChange = useCallback(() => {
    refetch();
  }, [refetch]);
  useQueueRealtime({ displayKey: query.data?.display_key, onChange });

  const mutation = useMutation({
    mutationFn: run,
    onSuccess: (result, action) => {
      toastService.success(successMessage(action, result));
      // Money moved: the owner's today cards too.
      queryClient.invalidateQueries({ queryKey: ['today-report', center?.id] });
      return queryClient.invalidateQueries({ queryKey });
    },
    onError: error => {
      toastService.error(
        // Plan limits come with a message written for the desk (what to do next).
        isPlanLimitError(error) ? (error as Error).message : toUserMessage(error, 'That didn’t work. Please try again.'),
      );
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    centers,
    center,
    selectCenter: setCenterId,
    queue: query.data ?? null,
    /** Changes whenever the queue was fetched again (realtime nudge or poll). */
    dataUpdatedAt: query.dataUpdatedAt,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch,
    act: mutation.mutate,
    actAsync: mutation.mutateAsync,
    busy: mutation.isPending,
    pending: mutation.isPending ? mutation.variables : undefined,
  };
};
