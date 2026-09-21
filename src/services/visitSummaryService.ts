import { supabase } from '../lib/supabase';
import type {
  PrescriptionItemInput,
  SaveVisitSummaryPayload,
  VisitSummary,
} from '../types/visitSummary';

export const DIAGNOSIS_MAX = 1000;
export const NOTES_MAX = 4000;
export const MEDICINE_NAME_MAX = 200;
export const MEDICINE_FIELD_MAX = 100;
export const INSTRUCTIONS_MAX = 500;
export const MAX_MEDICINES = 30;

const summarySelect =
  'id, appointment_id, doctor_id, patient_id, diagnosis, notes, follow_up_date, created_at, updated_at, ' +
  'prescription_items(id, visit_summary_id, medicine_name, dosage, frequency, duration, instructions, sort_order)';

/** A row the doctor has not touched is dropped instead of being reported as an error. */
export const isBlankMedicine = (item: PrescriptionItemInput) =>
  ![item.medicine_name, item.dosage, item.frequency, item.duration, item.instructions].some(
    value => !!value?.trim(),
  );

export const visitSummaryService = {
  /** The summary for one appointment with its medicines in order, or null when none was written. */
  async getForAppointment(appointmentId: string): Promise<VisitSummary | null> {
    const { data, error } = await supabase
      .from('visit_summaries')
      .select(summarySelect)
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const summary = data as unknown as VisitSummary;
    return {
      ...summary,
      prescription_items: [...(summary.prescription_items ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    };
  },

  /**
   * Creates or replaces the summary and its medicine list in one database call
   * (see save_visit_summary). Row level security only lets the assigned doctor
   * write, and only once the appointment is 'completed'.
   */
  async save(payload: SaveVisitSummaryPayload): Promise<string> {
    const diagnosis = payload.diagnosis.trim();
    const notes = payload.notes.trim();
    const items = payload.items
      .filter(item => !isBlankMedicine(item))
      .map(item => ({
        medicine_name: item.medicine_name.trim(),
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
        duration: item.duration.trim(),
        instructions: item.instructions?.trim() || null,
      }));

    if (diagnosis.length > DIAGNOSIS_MAX) {
      throw new Error(`Diagnosis can be at most ${DIAGNOSIS_MAX} characters.`);
    }
    if (notes.length > NOTES_MAX) {
      throw new Error(`Notes can be at most ${NOTES_MAX} characters.`);
    }
    if (items.length > MAX_MEDICINES) {
      throw new Error(`A prescription can list at most ${MAX_MEDICINES} medicines.`);
    }
    const incomplete = items.findIndex(
      item => !item.medicine_name || !item.dosage || !item.frequency || !item.duration,
    );
    if (incomplete !== -1) {
      throw new Error(
        `Medicine ${incomplete + 1} needs a name, dosage, frequency and duration.`,
      );
    }
    if (!diagnosis && !notes && !payload.followUpDate && items.length === 0) {
      throw new Error('Add a diagnosis, a medicine, notes or a follow-up date first.');
    }

    const { data, error } = await supabase.rpc('save_visit_summary', {
      p_appointment_id: payload.appointmentId,
      p_diagnosis: diagnosis,
      p_notes: notes,
      p_follow_up_date: payload.followUpDate,
      p_items: items,
    });

    if (error) {
      if (error.code === '42501') {
        throw new Error('Only the assigned doctor can write a summary for a completed visit.');
      }
      throw new Error(error.message);
    }

    return data as string;
  },
};
