import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { visitSummaryService } from '../services/visitSummaryService';
import { toastService } from '../services/toastService';
import type { SaveVisitSummaryPayload, VisitSummary } from '../types/visitSummary';

export const visitSummaryKey = (appointmentId?: string) =>
  ['visit-summary', appointmentId] as const;

/** The summary for one appointment; `data` is null while none has been written. */
export function useVisitSummary(appointmentId?: string, enabled = true) {
  return useQuery<VisitSummary | null, Error>({
    queryKey: visitSummaryKey(appointmentId),
    queryFn: () => visitSummaryService.getForAppointment(appointmentId!),
    enabled: !!appointmentId && enabled,
  });
}

export function useSaveVisitSummary() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, SaveVisitSummaryPayload>({
    mutationFn: payload => visitSummaryService.save(payload),
    onSuccess: async (_id, variables) => {
      await queryClient.invalidateQueries({ queryKey: visitSummaryKey(variables.appointmentId) });
      toastService.success('Visit summary saved');
    },
    onError: error => {
      toastService.error(error.message);
    },
  });
}
