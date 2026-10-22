import type { AppointmentFull, AppointmentStatus } from '../../../../types/appointment';
import type { QueueSnapshot } from '../../../../types/queue';
import { getAppointmentStatusState } from '../../../../services/bookingService';
import {
  formatWaitDuration,
  getAppointmentDateTime,
  getAppointmentTimeLabel,
  getMinutesUntilAppointment,
} from '../../utils/appointmentTime';

export type QueueStatusView = {
  status: AppointmentStatus;
  isDoctorOnBreak: boolean;
  showQueueMetrics: boolean;
  queueStatusLabel: string;
  /** "Called" and "on break" are highlighted as warnings. */
  queueStatusTone: 'warning' | 'primary' | 'text';
  estimatedWaitLabel: string;
  peopleAheadLabel: string;
  currentServingToken: number | null;
  doctorAverageTime: number | null;
  /** 0..1 toward the patient's turn (linear bar). */
  progress: number;
  /** 0..1 current token / your token (ring). */
  ringProgress: number;
  helperText: string;
  canCheckIn: boolean;
  canCancel: boolean;
  isCalled: boolean;
};

/**
 * Everything the patient's queue status screen shows, from the appointment and
 * the live snapshot. Pure so the rules can be tested without rendering.
 */
export const buildQueueStatusView = (
  appointment: AppointmentFull,
  queueData: QueueSnapshot | null,
  now: Date = new Date(),
): QueueStatusView => {
  const waitMins = queueData?.estimatedWaitMins;
  const peopleAhead = queueData?.peopleAhead ?? 0;
  const isDoctorOnBreak = Boolean(queueData?.isOnBreak) || queueData?.queueStatus === 'doctor_on_break';
  const { isExpired, isNoShow, resolvedStatus: status } = getAppointmentStatusState(appointment, now);

  const appointmentDateTime = getAppointmentDateTime(appointment);
  const minutesUntilAppointment = getMinutesUntilAppointment(appointment, now);
  const inQueue = status === 'checked_in' || status === 'called' || status === 'in_progress';
  const started = inQueue || appointmentDateTime.getTime() <= now.getTime();
  const timePassed = started && (status === 'pending' || status === 'confirmed') && appointmentDateTime.getTime() < now.getTime();
  const showQueueMetrics =
    started && !timePassed && status !== 'cancelled' && status !== 'completed' && !isExpired && !isNoShow;
  const isCalled = status === 'called' || status === 'in_progress';

  const queueStatusLabel = isDoctorOnBreak
    ? 'Department on Break'
    : isCalled
      ? 'Called'
      : status === 'checked_in'
        ? 'Arrived'
        : status === 'completed'
          ? 'Completed'
          : status === 'cancelled'
            ? 'Cancelled'
            : timePassed
              ? 'Time Passed'
              : 'Scheduled';

  const estimatedWaitLabel = timePassed
    ? '--'
    : showQueueMetrics
      ? waitMins != null
        ? `${waitMins} min`
        : '--'
      : formatWaitDuration(minutesUntilAppointment);

  const initialWait = Math.max(waitMins ?? 0, appointment.estimated_wait_mins ?? 0, 1);
  const progress = showQueueMetrics && waitMins != null ? Math.max(0, 1 - waitMins / initialWait) : 0;
  const yourToken = appointment.token_number ?? 0;
  const currentToken = queueData?.currentToken ?? 0;
  const ringProgress = showQueueMetrics && yourToken > 0 ? Math.min(1, Math.max(0, currentToken / yourToken)) : progress;

  const helperText = isNoShow
    ? 'You missed your 15-minute check-in grace period. The appointment is marked as No-Show.'
    : isExpired
      ? 'This appointment slot has expired.'
      : timePassed
        ? 'This appointment time has passed. Please contact the clinic.'
        : !showQueueMetrics
          ? `Appointment starts at ${getAppointmentTimeLabel(appointment)}.`
          : queueData == null
            ? 'Waiting for live queue data...'
            : isDoctorOnBreak
              ? 'Service is on break. Your position is saved and ETA will resume after the break.'
              : isCalled
                ? 'Your token has been called. Please proceed to the counter.'
                : peopleAhead === 0
                  ? "You're next!"
                  : `${peopleAhead} ${peopleAhead === 1 ? 'person' : 'people'} ahead of you`;

  return {
    status,
    isDoctorOnBreak,
    showQueueMetrics,
    queueStatusLabel,
    queueStatusTone: isCalled || isDoctorOnBreak ? 'warning' : status === 'checked_in' ? 'primary' : 'text',
    estimatedWaitLabel,
    peopleAheadLabel: showQueueMetrics ? `${peopleAhead}` : '--',
    currentServingToken: queueData?.currentToken ?? null,
    doctorAverageTime: queueData?.averageConsultationTime ?? null,
    progress,
    ringProgress,
    helperText,
    canCheckIn: appointment.status === 'confirmed',
    canCancel: appointment.status === 'pending' || appointment.status === 'confirmed',
    isCalled,
  };
};
