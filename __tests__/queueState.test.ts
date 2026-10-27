import {
  availabilityLabel,
  doctorAvailability,
  formatClock,
  lateMinutesLeft,
  minutesWithDoctor,
  paymentChip,
  splitTokens,
} from '../src/features/queue/utils/queueState';
import { hasModule, isPlanLimitError, tokenLimit, tokenLimitMessage } from '../src/features/plans/modules';
import { canRunReception, resolveAppRole } from '../src/utils/roleMapping';
import { deskCenters } from '../src/features/staff/hooks/useReception';
import type { QueueToken } from '../src/features/queue/api/queueRpc';

const token = (id: string, status: QueueToken['status'], extra: Partial<QueueToken> = {}): QueueToken => ({
  id,
  token_number: Number(id),
  status,
  source: 'walk_in',
  patient_name: `Patient ${id}`,
  appointment_time: null,
  checked_in_at: null,
  called_at: null,
  completed_at: null,
  skipped_at: null,
  created_at: '2026-10-22T05:00:00Z',
  ...extra,
});

describe('splitTokens', () => {
  it('splits into with-doctor, waiting (server order kept) and done', () => {
    const tokens = [token('3', 'called'), token('5', 'checked_in'), token('4', 'checked_in', { skipped_at: 'x' }), token('1', 'completed'), token('2', 'no_show')];
    const { current, waiting, next, done } = splitTokens(tokens);
    expect(current?.id).toBe('3');
    expect(waiting.map(t => t.id)).toEqual(['5', '4']);
    expect(next?.id).toBe('5');
    expect(done.map(t => t.id)).toEqual(['1', '2']);
  });

  it('handles an empty queue', () => {
    expect(splitTokens([])).toEqual({ current: null, waiting: [], next: null, done: [], awaitingPayment: [] });
  });

  it('keeps tokens waiting for their fee out of the line (fee before)', () => {
    const tokens = [
      token('2', 'checked_in', { payment_status: 'paid' }),
      token('1', 'pending', { source: 'qr', payment_status: 'awaiting' }),
      token('3', 'checked_in', { payment_status: null }),
      token('4', 'expired', { source: 'qr', payment_status: 'awaiting' }),
    ];
    const { waiting, next, awaitingPayment, done } = splitTokens(tokens);
    expect(waiting.map(t => t.id)).toEqual(['2', '3']);
    expect(next?.id).toBe('2');
    expect(awaitingPayment.map(t => t.id)).toEqual(['1']);
    expect(done.map(t => t.id)).toEqual(['4']);
  });
});

describe('paymentChip', () => {
  it('labels paid, free, fee due and refunded; nothing when unrecorded', () => {
    expect(paymentChip('paid')).toEqual({ label: 'Paid', tone: 'success' });
    expect(paymentChip('waived')).toEqual({ label: 'Free', tone: 'info' });
    expect(paymentChip('awaiting')).toEqual({ label: 'Fee due', tone: 'warning' });
    expect(paymentChip('refunded')).toEqual({ label: 'Refunded', tone: 'default' });
    expect(paymentChip(null)).toBeNull();
    expect(paymentChip(undefined)).toBeNull();
  });
});

describe('late / break', () => {
  const now = new Date('2026-10-22T10:00:00Z');

  it('counts whole minutes left, zero once passed', () => {
    expect(lateMinutesLeft('2026-10-22T10:14:30Z', now)).toBe(15);
    expect(lateMinutesLeft('2026-10-22T09:59:00Z', now)).toBe(0);
    expect(lateMinutesLeft(null, now)).toBe(0);
  });

  it('break wins over late', () => {
    expect(doctorAvailability({ is_on_break: true, late_until: '2026-10-22T10:30:00Z' }, now)).toEqual({ kind: 'break' });
    expect(doctorAvailability({ is_on_break: false, late_until: '2026-10-22T10:30:00Z' }, now)).toMatchObject({ kind: 'late', minutes: 30 });
    expect(doctorAvailability({ is_on_break: false, late_until: '2026-10-22T09:30:00Z' }, now)).toEqual({ kind: 'available' });
  });

  it('labels each state', () => {
    expect(availabilityLabel({ kind: 'break' })).toBe('On a break');
    expect(availabilityLabel({ kind: 'available' })).toBe('Seeing patients');
    expect(availabilityLabel({ kind: 'late', minutes: 10, until: '2026-10-22T10:10:00' })).toBe('Running late · back ~10:10 AM');
  });

  it('formats a clock time and time with the doctor', () => {
    expect(formatClock('2026-10-22T00:05:00')).toBe('12:05 AM');
    expect(formatClock('2026-10-22T13:45:00')).toBe('1:45 PM');
    expect(minutesWithDoctor({ called_at: '2026-10-22T09:48:00Z', started_at: null }, now)).toBe(12);
    expect(minutesWithDoctor(null, now)).toBeNull();
  });
});

describe('plan limits', () => {
  it('free plan: ok, near from 80%, reached at the limit', () => {
    expect(tokenLimit(10, 30)).toMatchObject({ level: 'ok', left: 20 });
    expect(tokenLimit(24, 30)).toMatchObject({ level: 'near', left: 6 });
    expect(tokenLimit(30, 30)).toMatchObject({ level: 'reached', left: 0 });
    expect(tokenLimit(31, 30)).toMatchObject({ level: 'reached', left: 0 });
    expect(tokenLimit(500, null)).toEqual({ level: 'unlimited' });
  });

  it('tells the receptionist what to do', () => {
    expect(tokenLimitMessage(tokenLimit(10, 30))).toBeNull();
    expect(tokenLimitMessage(tokenLimit(25, 30))).toContain('5 of today');
    expect(tokenLimitMessage(tokenLimit(30, 30))).toContain('until tomorrow');
    expect(tokenLimitMessage(tokenLimit(30, 30))).toContain('owner');
  });

  it('modules and plan errors', () => {
    expect(hasModule({ modules: ['queue', 'qr_join'] }, 'sms')).toBe(false);
    expect(hasModule({ modules: ['queue', 'sms'] }, 'sms')).toBe(true);
    expect(hasModule(null, 'queue')).toBe(false);
    expect(isPlanLimitError({ code: 'PT402', message: 'limit' })).toBe(true);
    expect(isPlanLimitError(new Error('x'))).toBe(false);
  });
});

describe('app role from org membership', () => {
  const ws = (roles: string[]) => [{ roles }];

  it('platform admin stays admin', () => {
    expect(resolveAppRole({ profileRole: 'admin', workspaces: ws(['owner']), doctorId: null })).toBe('admin');
  });

  it('web-invited receptionist and web owner (profile role client) get the reception app', () => {
    expect(resolveAppRole({ profileRole: 'client', workspaces: ws(['receptionist']), doctorId: null })).toBe('staff');
    expect(resolveAppRole({ profileRole: 'client', workspaces: ws(['owner']), doctorId: null })).toBe('staff');
  });

  it('doctor with a linked record gets the doctor app, owner-doctors too', () => {
    expect(resolveAppRole({ profileRole: 'doctor', workspaces: ws(['doctor']), doctorId: 'd1' })).toBe('doctor');
    expect(resolveAppRole({ profileRole: 'client', workspaces: ws(['doctor', 'owner']), doctorId: 'd1' })).toBe('doctor');
  });

  it('legacy roles without membership keep working; patients are clients', () => {
    expect(resolveAppRole({ profileRole: 'staff', workspaces: [], doctorId: null })).toBe('staff');
    expect(resolveAppRole({ profileRole: 'client', workspaces: [], doctorId: null })).toBe('client');
    expect(resolveAppRole({ profileRole: undefined, workspaces: [], doctorId: null })).toBe('client');
  });

  it('who can run the desk', () => {
    expect(canRunReception(ws(['doctor', 'owner']))).toBe(true);
    expect(canRunReception(ws(['doctor']))).toBe(false);
  });

  it('desk centers: owners and receptionists only', () => {
    const centers = deskCenters([
      { organization_id: 'o1', organization_name: 'A', organization_status: 'active', roles: ['doctor'], centers: [{ id: 'c0', name: 'X', slug: 'x' }] },
      { organization_id: 'o2', organization_name: 'B', organization_status: 'active', roles: ['owner'], centers: [{ id: 'c1', name: 'Y', slug: 'y' }] },
    ]);
    expect(centers).toEqual([{ id: 'c1', name: 'Y', organizationId: 'o2', organizationName: 'B', isOwner: true }]);
  });
});
