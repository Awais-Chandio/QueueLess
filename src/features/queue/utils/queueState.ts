import type { AppointmentStatus } from '../../../types/appointment';
import type { DoctorState, QueueToken } from '../api/queueRpc';

export const WAITING_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'checked_in'];
export const WITH_DOCTOR_STATUSES: AppointmentStatus[] = ['called', 'in_progress'];

/** Fee before: the token waits for its fee and is not in the line yet (it is taken at the web desk). */
export const isAwaitingPayment = (token: Pick<QueueToken, 'status' | 'payment_status'>) =>
  token.payment_status === 'awaiting' && WAITING_STATUSES.includes(token.status);
export const isWaiting = (token: Pick<QueueToken, 'status' | 'payment_status'>) =>
  WAITING_STATUSES.includes(token.status) && token.payment_status !== 'awaiting';
export const isWithDoctor = (token: Pick<QueueToken, 'status'>) => WITH_DOCTOR_STATUSES.includes(token.status);

/**
 * The RPCs already return tokens in queue order (with the doctor, then waiting
 * in call order, then finished). This only splits them; it never re-sorts the
 * waiting list, so a skipped token stays behind whoever joined before the skip.
 */
export const splitTokens = (tokens: QueueToken[]) => {
  const current = tokens.find(isWithDoctor) ?? null;
  const waiting = tokens.filter(isWaiting);
  const awaitingPayment = tokens.filter(isAwaitingPayment);
  const done = tokens.filter(token => !WAITING_STATUSES.includes(token.status) && !isWithDoctor(token));
  return { current, waiting, next: waiting[0] ?? null, done, awaitingPayment };
};

/** Paid / Free / Fee due / Refunded chip on a token; null when nothing was recorded. */
export const paymentChip = (
  status: QueueToken['payment_status'],
): { label: string; tone: 'success' | 'info' | 'warning' | 'default' } | null => {
  switch (status) {
    case 'paid':
      return { label: 'Paid', tone: 'success' };
    case 'waived':
      return { label: 'Free', tone: 'info' };
    case 'awaiting':
      return { label: 'Fee due', tone: 'warning' };
    case 'refunded':
      return { label: 'Refunded', tone: 'default' };
    default:
      return null;
  }
};

/** Whole minutes until `lateUntil`, 0 when it has passed or isn't set. */
export const lateMinutesLeft = (lateUntil: string | null | undefined, now: Date = new Date()) => {
  if (!lateUntil) return 0;
  const ms = new Date(lateUntil).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
};

export const formatClock = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
};

export type DoctorAvailability =
  | { kind: 'available' }
  | { kind: 'break' }
  | { kind: 'late'; minutes: number; until: string };

export const doctorAvailability = (
  doctor: Pick<DoctorState, 'is_on_break' | 'late_until'>,
  now: Date = new Date(),
): DoctorAvailability => {
  if (doctor.is_on_break) return { kind: 'break' };
  const minutes = lateMinutesLeft(doctor.late_until, now);
  if (minutes > 0 && doctor.late_until) return { kind: 'late', minutes, until: doctor.late_until };
  return { kind: 'available' };
};

export const availabilityLabel = (availability: DoctorAvailability) => {
  switch (availability.kind) {
    case 'break':
      return 'On a break';
    case 'late':
      return `Running late · back ~${formatClock(availability.until)}`;
    default:
      return 'Seeing patients';
  }
};

/** Minutes the token has been with the doctor, or null. */
export const minutesWithDoctor = (token: Pick<QueueToken, 'called_at' | 'started_at'> | null, now: Date = new Date()) => {
  const since = token?.started_at ?? token?.called_at;
  if (!since) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
};

/** Late options offered by the doctor and the desk. */
export const LATE_OPTIONS = [10, 15, 30, 45, 60] as const;
