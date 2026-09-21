import { getAvailableActions as staffActions } from '../src/features/staff/components/AppointmentRow';
import { getAvailableActions as doctorActions } from '../src/features/doctor/components/QueueAppointmentRow';
import type { AppointmentStatus } from '../src/types/appointment';

const statuses: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checked_in',
  'called',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'no_show',
];

describe('queue actions by role', () => {
  it('never offers staff a way to complete a visit', () => {
    statuses.forEach(status => {
      expect(staffActions(status)).not.toContain('complete_service');
    });
  });

  it('keeps call and no-show on the staff queue', () => {
    expect(staffActions('checked_in')).toContain('start_service');
    expect(staffActions('called')).toEqual(['no_show']);
    expect(staffActions('in_progress')).toEqual(['no_show']);
  });

  it('lets the doctor complete a patient who has been called in', () => {
    expect(doctorActions('called')).toContain('complete_service');
    expect(doctorActions('in_progress')).toContain('complete_service');
  });

  it('does not offer the doctor completion before the patient is called', () => {
    (['pending', 'confirmed', 'checked_in'] as AppointmentStatus[]).forEach(status => {
      expect(doctorActions(status)).not.toContain('complete_service');
    });
  });
});
