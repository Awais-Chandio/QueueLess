import { sortStaffQueueAppointments } from '../src/features/staff/api/staffQueueService';
import { getPeopleAhead } from '../src/features/queue/api/queueService';
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
