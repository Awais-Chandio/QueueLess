import type { AppointmentFull } from '../../../types/appointment';

export const APPOINTMENT_SLOT_LABELS = [
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
] as const;

export type AppointmentSlotLabel = typeof APPOINTMENT_SLOT_LABELS[number];

const slotPattern = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/;
const twentyFourHourPattern = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

export const timeToMinutes = (timeStr: string | null | undefined): number => {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  
  const ampmMatch = slotPattern.exec(cleaned);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3];
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }
    return hour * 60 + minute;
  }

  const regex24h = twentyFourHourPattern.exec(cleaned);
  if (regex24h) {
    const hour = parseInt(regex24h[1], 10);
    const minute = parseInt(regex24h[2], 10);
    return hour * 60 + minute;
  }

  return 0;
};

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
  const normalizedTime = normalizeAppointmentTimeSlot(appointmentTime) || appointmentTime;
  const match = slotPattern.exec(normalizedTime);

  const parts = appointmentDate.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dateTime = new Date(year, month, day, 0, 0, 0, 0);

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
  const parts = appointmentDate.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day, 0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return date.getTime() < today.getTime();
};

export const isTodayAppointmentDate = (
  appointmentDate: string,
  now = new Date(),
) => {
  const parts = appointmentDate.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  return (
    year === now.getFullYear() &&
    month === now.getMonth() &&
    day === now.getDate()
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
    const parts = appointment.appointment_date.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return new Date(appointment.scheduled_at).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

export const getPakistanDayOfWeek = (dateStr?: string): number => {
  let date: Date;
  if (dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    date = new Date();
  }
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
  }).format(date);

  const mapping: Record<string, number> = {
    'Sun': 0,
    'Mon': 1,
    'Tue': 2,
    'Wed': 3,
    'Thu': 4,
    'Fri': 5,
    'Sat': 6,
  };
  return mapping[dayStr];
};

export const getPakistanTodayDateString = (): string => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

