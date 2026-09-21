import { sortStaffQueueAppointments } from '../src/features/staff/api/staffQueueService';
import { getPeopleAhead } from '../src/features/queue/api/queueService';
import {
  formatWaitDuration,
  getScheduledAtFromSlot,
  isPastAppointmentDate,
  isPastAppointmentSlot,
  normalizeAppointmentTimeSlot,
} from '../src/features/appointments/utils/appointmentTime';
import type { AppointmentFull } from '../src/types/appointment';

const createAppointment = (
  id: string,
  status: AppointmentFull['status'],
  token: number,
): AppointmentFull => ({
  id,
  center_id: 'center-id',
  service_id: 'service-id',
  scheduled_at: '2026-06-23T09:00:00.000Z',
  status,
  token_number: token,
});

describe('Patient check-in queue sorting', () => {
  it('places checked-in patients before confirmed and pending patients', () => {
    const appointments = [
      createAppointment('pending', 'pending', 1),
      createAppointment('confirmed', 'confirmed', 2),
      createAppointment('checked-in', 'checked_in', 3),
    ];

    const sorted = sortStaffQueueAppointments(appointments);

    expect(sorted.map(appointment => appointment.status)).toEqual([
      'checked_in',
      'confirmed',
      'pending',
    ]);
  });

  it('sorts patients with the same status by token number', () => {
    const appointments = [
      createAppointment('second', 'checked_in', 8),
      createAppointment('first', 'checked_in', 4),
    ];

    const sorted = sortStaffQueueAppointments(appointments);

    expect(sorted.map(appointment => appointment.token_number)).toEqual([4, 8]);
  });
});

describe('Call token queue calculation', () => {
  it('calculates people ahead from your token and the current called token', async () => {
    await expect(getPeopleAhead(12, 9)).resolves.toBe(3);
  });

  it('never shows negative people ahead', async () => {
    await expect(getPeopleAhead(4, 9)).resolves.toBe(0);
  });
});

describe('Time slot booking helpers', () => {
  it('normalizes database time values for slot comparison', () => {
    expect(normalizeAppointmentTimeSlot('09:00:00')).toBe('09:00 AM');
    expect(normalizeAppointmentTimeSlot('10:30')).toBe('10:30 AM');
    expect(normalizeAppointmentTimeSlot('11:00 AM')).toBe('11:00 AM');
  });

  it('sorts staff appointments by appointment date and time before queue tie-breakers', () => {
    const appointments: AppointmentFull[] = [
      {
        ...createAppointment('later', 'confirmed', 1),
        scheduled_at: getScheduledAtFromSlot('2026-06-24', '11:00 AM'),
        appointment_date: '2026-06-24',
        appointment_time: '11:00 AM',
      },
      {
        ...createAppointment('earlier', 'pending', 2),
        scheduled_at: getScheduledAtFromSlot('2026-06-24', '09:00 AM'),
        appointment_date: '2026-06-24',
        appointment_time: '09:00 AM',
      },
    ];

    const sorted = sortStaffQueueAppointments(appointments);

    expect(sorted.map(appointment => appointment.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('detects past appointment dates and slots', () => {
    const now = new Date('2026-06-24T10:15:00');

    expect(isPastAppointmentDate('2026-06-23', now)).toBe(true);
    expect(isPastAppointmentDate('2026-06-24', now)).toBe(false);
    expect(isPastAppointmentSlot('2026-06-24', '09:00 AM', now)).toBe(true);
    expect(isPastAppointmentSlot('2026-06-24', '10:30 AM', now)).toBe(false);
  });

  it('formats realistic wait durations', () => {
    expect(formatWaitDuration(35)).toBe('35 min');
    expect(formatWaitDuration(95)).toBe('1h 35m');
  });
});
