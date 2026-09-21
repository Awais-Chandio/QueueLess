export interface PrescriptionItem {
  id: string;
  visit_summary_id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  sort_order: number;
}

export interface VisitSummary {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  notes: string | null;
  /** Local calendar date, `YYYY-MM-DD`. */
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  prescription_items: PrescriptionItem[];
}

/** One medicine row as the doctor edits it. */
export interface PrescriptionItemInput {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface SaveVisitSummaryPayload {
  appointmentId: string;
  diagnosis: string;
  notes: string;
  /** `YYYY-MM-DD`, or null for no follow-up. */
  followUpDate: string | null;
  items: PrescriptionItemInput[];
}
