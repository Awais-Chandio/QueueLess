import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewService } from '../services/reviewService';
import { toastService } from '../services/toastService';
import type { DoctorReview, SubmitReviewPayload } from '../types/review';

export const appointmentReviewKey = (appointmentId?: string) =>
  ['appointment-review', appointmentId] as const;

/** The patient's review for one appointment; `data` is null when it has not been rated. */
export function useAppointmentReview(appointmentId?: string, enabled = true) {
  return useQuery({
    queryKey: appointmentReviewKey(appointmentId),
    queryFn: () => reviewService.getForAppointment(appointmentId!),
    enabled: !!appointmentId && enabled,
  });
}

export function useDoctorReviews(doctorId?: string) {
  return useQuery({
    queryKey: ['doctor-reviews', doctorId],
    queryFn: () => reviewService.getForDoctor(doctorId!),
    enabled: !!doctorId,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation<DoctorReview, Error, SubmitReviewPayload>({
    mutationFn: payload => reviewService.submit(payload),
    onSuccess: (review, variables) => {
      // Writing the row straight into the cache is what hides the "Rate your
      // visit" prompt instantly, without waiting on a refetch of the screen.
      queryClient.setQueryData(appointmentReviewKey(variables.appointmentId), review);
      // Doctor cards read avg_rating/review_count, which the database trigger
      // has just changed.
      queryClient.invalidateQueries({ queryKey: ['doctor-reviews', variables.doctorId] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toastService.success('Thanks for your feedback');
    },
    onError: (error, variables) => {
      toastService.error(error.message);
      // A duplicate means a review already exists (another device, or a retry
      // after a dropped response); refetch so the prompt does not linger.
      if (error.message.includes('already reviewed')) {
        queryClient.invalidateQueries({
          queryKey: appointmentReviewKey(variables.appointmentId),
        });
      }
    },
  });
}
