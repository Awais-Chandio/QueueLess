export interface DoctorReview {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface SubmitReviewPayload {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  rating: number;
  comment?: string;
}
