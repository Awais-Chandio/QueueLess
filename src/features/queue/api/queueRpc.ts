import { supabase } from '../../../lib/supabase';
import type { AppointmentStatus } from '../../../types/appointment';

// Shapes of the jsonb the queue RPCs return (supabase/migrations
// 20261021130200_reception.sql, 20261022100000_doctor_app.sql). The generated
// Database type only knows them as Json.

export type TokenSource = 'walk_in' | 'qr' | 'online' | 'app';

/** Phase 2A. awaiting = fee before: not in the line until paid. null = nothing recorded. */
export type PaymentStatus = 'awaiting' | 'paid' | 'waived' | 'refunded';

export interface QueueToken {
  id: string;
  token_number: number;
  status: AppointmentStatus;
  source: TokenSource | null;
  patient_name: string | null;
  /** Reception only; the doctor queue never carries phone numbers. */
  phone?: string | null;
  public_code?: string | null;
  /** Doctor queue: walk-in / QR patient without an app account. */
  is_guest?: boolean;
  /** Doctor queue: visit notes exist. */
  has_summary?: boolean;
  payment_status?: PaymentStatus | null;
  /** Fee due in whole rupees; null when the clinic doesn't track fees. */
  fee_pkr?: number | null;
  appointment_time: string | null;
  checked_in_at: string | null;
  called_at: string | null;
  started_at?: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string;
}

export interface PlanSummary {
  id: string;
  modules: string[];
  tokens_per_day: number | null;
}

export interface DoctorState {
  id: string;
  name: string;
  specialty: string | null;
  room: string | null;
  is_on_break: boolean;
  /** Set while the doctor is running late; already past times come back null. */
  late_until: string | null;
  average_minutes: number;
  takes_tokens: boolean;
}

export interface DoctorQueue {
  doctor: DoctorState & { break_start: string | null };
  center: { id: string; name: string; slug: string };
  organization: { id: string; name: string; timezone: string };
  plan: PlanSummary | null;
  /** The center's fee mode (2A). */
  fee_mode?: 'before' | 'after' | 'off';
  today: string;
  server_time: string;
  tokens: QueueToken[];
}

export interface ReceptionDoctor extends DoctorState {
  tokens: QueueToken[];
}

export interface ReceptionQueue {
  center: { id: string; name: string; slug: string; organization_id: string; organization_name: string; timezone: string };
  today: string;
  server_time: string;
  display_key: string | null;
  tokens_today: number;
  tokens_per_day: number | null;
  doctors: ReceptionDoctor[];
}

export interface Workspace {
  organization_id: string;
  organization_name: string;
  organization_status: string;
  roles: string[];
  centers: { id: string; name: string; slug: string }[];
}

export interface IssuedToken {
  appointment_id: string | null;
  public_code: string;
  token_number: number;
  people_ahead: number;
  eta_minutes: number;
}

export interface CompleteVisitInput {
  appointmentId: string;
  diagnosis?: string;
  notes?: string;
  followUpDate?: string | null;
  items?: {
    medicine_name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string | null;
  }[];
}

/** An RPC error with the Postgres/PostgREST code kept (PT402 = plan limit, PT409 = wrong state, 42501 = not allowed). */
export class QueueRpcError extends Error {
  constructor(message: string, readonly code: string | undefined) {
    super(message);
    this.name = 'QueueRpcError';
  }
}

const fail = (error: { message: string; code?: string }): never => {
  throw new QueueRpcError(error.message, error.code);
};

// Untyped access for the jsonb RPCs; arguments are still checked by the
// wrappers below.
const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>)(fn, args);

export const queueRpc = {
  async getMyWorkspaces(): Promise<Workspace[]> {
    const { data, error } = await rpc('get_my_workspaces');
    if (error) fail(error);
    return (data as Workspace[] | null) ?? [];
  },

  async getDoctorQueue(doctorId: string): Promise<DoctorQueue> {
    const { data, error } = await rpc('get_doctor_queue', { p_doctor_id: doctorId });
    if (error) fail(error);
    return data as DoctorQueue;
  },

  async getReceptionQueue(centerId: string): Promise<ReceptionQueue> {
    const { data, error } = await rpc('get_reception_queue', { p_center_id: centerId });
    if (error) fail(error);
    return data as ReceptionQueue;
  },

  /** Completes whoever is with the doctor and calls the next waiting token. Null when nobody is waiting. */
  async callNext(doctorId: string): Promise<{ appointment_id: string; token_number: number; patient_name: string | null } | null> {
    const { data, error } = await rpc('call_next', { p_doctor_id: doctorId });
    if (error) fail(error);
    const rows = (data as { appointment_id: string; token_number: number; patient_name: string | null }[] | null) ?? [];
    return rows[0] ?? null;
  },

  async skipToken(appointmentId: string): Promise<void> {
    const { error } = await rpc('skip_token', { p_appointment_id: appointmentId });
    if (error) fail(error);
  },

  async markNoShow(appointmentId: string): Promise<void> {
    const { error } = await rpc('mark_no_show', { p_appointment_id: appointmentId });
    if (error) fail(error);
  },

  async recallToken(appointmentId: string): Promise<void> {
    const { error } = await rpc('recall_token', { p_appointment_id: appointmentId });
    if (error) fail(error);
  },

  async setDoctorBreak(doctorId: string, onBreak: boolean): Promise<void> {
    const { error } = await rpc('set_doctor_break', { p_doctor_id: doctorId, p_on_break: onBreak });
    if (error) fail(error);
  },

  /** 1..240 minutes; 0 clears. Returns the new late-until time (null when cleared). */
  async setDoctorLate(doctorId: string, minutes: number): Promise<string | null> {
    const { data, error } = await rpc('set_doctor_late', { p_doctor_id: doctorId, p_minutes: minutes });
    if (error) fail(error);
    return (data as string | null) ?? null;
  },

  async issueWalkIn(doctorId: string, name: string, phone: string | null): Promise<IssuedToken> {
    const { data, error } = await rpc('issue_token', {
      p_doctor_id: doctorId,
      p_name: name,
      p_phone: phone,
      p_source: 'walk_in',
    });
    if (error) fail(error);
    return ((data as IssuedToken[] | null) ?? [])[0];
  },

  /** Completes the token with the doctor (if not already) and saves the visit notes. */
  async completeVisit(input: CompleteVisitInput): Promise<{ appointment_id: string; status: string; summary_id: string | null }> {
    const { data, error } = await rpc('complete_visit', {
      p_appointment_id: input.appointmentId,
      p_diagnosis: input.diagnosis ?? null,
      p_notes: input.notes ?? null,
      p_follow_up_date: input.followUpDate ?? null,
      p_items: input.items ?? [],
    });
    if (error) fail(error);
    return data as { appointment_id: string; status: string; summary_id: string | null };
  },
};
