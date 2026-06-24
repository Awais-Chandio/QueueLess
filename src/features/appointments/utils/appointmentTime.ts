import type { AppointmentFull } from '../../../types/appointment';

export const APPOINTMENT_SLOT_LABELS = [
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
] as const;

export type AppointmentSlotLabel = typeof APPOINTMENT_SLOT_LABELS[number];

const slotPattern = /^(\d{2}):(\d{2})\s(AM|PM)$/;
const twentyFourHourPattern = /^(\d{2}):(\d{2})(?::\d{2})?$/;

export const normalizeAppointmentTimeSlot = (
  appointmentTime: string | null | undefined,
) => {
  if (!appointmentTime) {
    return null;
  }

  const trimmed = appointmentTime.trim().toUpperCase();

  if (slotPattern.test(trimmed)) {
    return trimmed;
  }

  const match = twentyFourHourPattern.exec(trimmed);

  if (!match) {
    return trimmed;
  }

  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${`${displayHour}`.padStart(2, '0')}:${minute} ${period}`;
};

export const formatAppointmentDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getSlotDateTime = (
  appointmentDate: string,
  appointmentTime: string,
) => {
  const match = slotPattern.exec(appointmentTime);
  const dateTime = new Date(`${appointmentDate}T00:00:00`);

  if (!match || Number.isNaN(dateTime.getTime())) {
    return dateTime;
  }

  const [, hourPart, minutePart, period] = match;
  const rawHour = Number(hourPart);
  const hour =
    period === 'PM' && rawHour !== 12
      ? rawHour + 12
      : period === 'AM' && rawHour === 12
        ? 0
        : rawHour;

  dateTime.setHours(hour, Number(minutePart), 0, 0);
  return dateTime;
};

export const getScheduledAtFromSlot = (
  appointmentDate: string,
  appointmentTime: string,
) => getSlotDateTime(appointmentDate, appointmentTime).toISOString();

export const isPastAppointmentDate = (
  appointmentDate: string,
  now = new Date(),
) => {
  const date = new Date(`${appointmentDate}T00:00:00`);
  const today = new Date(now);

  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return date.getTime() < today.getTime();
};

export const isTodayAppointmentDate = (
  appointmentDate: string,
  now = new Date(),
) => {
  const date = new Date(`${appointmentDate}T00:00:00`);

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

export const isPastAppointmentSlot = (
  appointmentDate: string,
  appointmentTime: string,
  now = new Date(),
) => getSlotDateTime(appointmentDate, appointmentTime).getTime() <= now.getTime();

export const getAppointmentDateTime = (
  appointment: Pick<AppointmentFull, 'appointment_date' | 'appointment_time' | 'scheduled_at'>,
) => {
  if (appointment.appointment_date && appointment.appointment_time) {
    return getSlotDateTime(
      appointment.appointment_date,
      appointment.appointment_time,
    );
  }

  return new Date(appointment.scheduled_at);
};

export const getMinutesUntilAppointment = (
  appointment: Pick<AppointmentFull, 'appointment_date' | 'appointment_time' | 'scheduled_at'>,
  now = new Date(),
) => Math.max(
  0,
  Math.ceil((getAppointmentDateTime(appointment).getTime() - now.getTime()) / 60000),
);

export const formatWaitDuration = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
};

export const getAppointmentDateLabel = (
  appointment: Pick<AppointmentFull, 'appointment_date' | 'scheduled_at'>,
) => {
  if (appointment.appointment_date) {
    return new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString();
  }

  return new Date(appointment.scheduled_at).toLocaleDateString();
};

export const getAppointmentTimeLabel = (
  appointment: Pick<AppointmentFull, 'appointment_time' | 'scheduled_at'>,
) => {
  if (appointment.appointment_time) {
    return normalizeAppointmentTimeSlot(appointment.appointment_time) ??
      appointment.appointment_time;
  }

  return new Date(appointment.scheduled_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};
