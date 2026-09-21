import { supabase } from '../lib/supabase';
import type { DoctorReview, SubmitReviewPayload } from '../types/review';

export const REVIEW_COMMENT_MAX = 500;

const reviewSelect =
  'id, appointment_id, patient_id, doctor_id, rating, comment, created_at';

export const reviewService = {
  /** The review left for one appointment, or null if the patient has not rated it yet. */
  async getForAppointment(appointmentId: string): Promise<DoctorReview | null> {
    const { data, error } = await supabase
      .from('doctor_reviews')
      .select(reviewSelect)
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as DoctorReview | null) ?? null;
  },

  /** Newest reviews first, for the public doctor profile. */
  async getForDoctor(doctorId: string, limit = 20): Promise<DoctorReview[]> {
    const { data, error } = await supabase
      .from('doctor_reviews')
      .select(reviewSelect)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as DoctorReview[];
  },

  /**
   * Row level security only lets a patient insert for their own completed
   * appointment, and the unique key on appointment_id allows one review each,
   * so a rejected insert is translated into something a patient can act on.
   */
  async submit(payload: SubmitReviewPayload): Promise<DoctorReview> {
    const rating = Math.round(payload.rating);
    if (rating < 1 || rating > 5) {
      throw new Error('Please choose a rating from 1 to 5 stars.');
    }

    const comment = payload.comment?.trim() || null;
    if (comment && comment.length > REVIEW_COMMENT_MAX) {
      throw new Error(`Comments can be at most ${REVIEW_COMMENT_MAX} characters.`);
    }

    const { data, error } = await supabase
      .from('doctor_reviews')
      .insert({
        appointment_id: payload.appointmentId,
        doctor_id: payload.doctorId,
        patient_id: payload.patientId,
        rating,
        comment,
      })
      .select(reviewSelect)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('You have already reviewed this visit.');
      }
      if (error.code === '42501') {
        throw new Error('This visit cannot be reviewed yet.');
      }
      throw new Error(error.message);
    }

    return data as DoctorReview;
  },
};
