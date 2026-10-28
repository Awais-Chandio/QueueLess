/**
 * Phase 2C: the phone desk takes fees like the web reception (one-step
 * walk-in, "Fee pending", fee sheet, claim Verify / Reject), and the owner's
 * Today screen (cards, cash per receptionist, records on the web, no plan links).
 */
import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@react-navigation/native', () => {
  const navigate = jest.fn();
  return { useNavigation: () => ({ navigate }), useIsFocused: () => true, __navigate: navigate };
});
jest.mock('../src/features/staff/hooks/useReception', () => ({
  ...jest.requireActual('../src/features/staff/hooks/useReception'),
  useReception: jest.fn(),
}));
jest.mock('../src/features/staff/hooks/useTodayReport', () => ({ useTodayReport: jest.fn() }));
jest.mock('../src/features/plans/components/PlanStatusCard', () => ({ PlanStatusCard: () => null }));
jest.mock('../src/features/staff/components/StaffLogoutButton', () => () => null);
// moti's skeleton resolves its own React copy under Jest (see skeletonResolution.test.ts).
jest.mock('../src/components/ui/Skeleton', () => {
  const { View } = require('react-native');
  return { Skeleton: (props: object) => <View testID="skeleton" {...props} /> };
});

import { supabase } from '../src/lib/supabase';
import { queueRpc, type QueueToken, type ReceptionDoctor } from '../src/features/queue/api/queueRpc';
import { WalkInSheet } from '../src/features/staff/components/WalkInSheet';
import { FeePendingList, FeeSheet } from '../src/features/staff/components/Fees';
import OwnerHomeScreen, { OPEN_HISAAB } from '../src/features/staff/screens/OwnerHomeScreen';
import { useReception } from '../src/features/staff/hooks/useReception';
import { useTodayReport } from '../src/features/staff/hooks/useTodayReport';
import { hisaabUrl } from '../src/config/web';
import { isStaffPush } from '../src/hooks/useStaffPush';
import {
  amountDue,
  formatRs,
  minutesLeft,
  parseAmount,
  pendingFees,
  walkInMessage,
  walkInTakesFee,
} from '../src/features/staff/utils/fees';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const render = (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
  });
  return renderer;
};

/** The outermost element with this testID (the component that owns the handlers). */
const byId = (root: ReactTestInstance, id: string) => root.findAll(node => node.props.testID === id)[0];
const has = (root: ReactTestInstance, id: string) => root.findAll(node => node.props.testID === id).length > 0;
const texts = (root: ReactTestInstance) =>
  root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');
const press = async (root: ReactTestInstance, id: string) => {
  await act(async () => {
    await byId(root, id).props.onPress();
  });
};

const token = (over: Partial<QueueToken> = {}): QueueToken => ({
  id: 'appt-1',
  token_number: 7,
  status: 'pending',
  source: 'qr',
  patient_name: 'Sana Bibi',
  payment_status: 'awaiting',
  fee_pkr: 1000,
  payment_deadline: null,
  claim: null,
  appointment_time: null,
  checked_in_at: null,
  called_at: null,
  completed_at: null,
  skipped_at: null,
  created_at: '2026-10-28T05:00:00Z',
  ...over,
});

const doctor = (over: Partial<ReceptionDoctor> = {}): ReceptionDoctor => ({
  id: 'doc-1',
  name: 'Dr. Ayesha',
  specialty: null,
  room: null,
  is_on_break: false,
  late_until: null,
  average_minutes: 10,
  takes_tokens: true,
  fee: 1500,
  tokens: [],
  ...over,
});

describe('fee rules (same as the web desk)', () => {
  it('the walk-in takes the fee only with fee before and a doctor fee', () => {
    expect(walkInTakesFee('before', 1500)).toBe(true);
    expect(walkInTakesFee('before', 0)).toBe(false);
    expect(walkInTakesFee('after', 1500)).toBe(false);
    expect(walkInTakesFee('off', 1500)).toBe(false);
    expect(walkInTakesFee(undefined, 1500)).toBe(false);
  });

  it('amounts are whole rupees 1..1,000,000', () => {
    expect(parseAmount('1500')).toBe(1500);
    expect(parseAmount('1,500')).toBe(1500);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.5')).toBeNull();
    expect(parseAmount('2000000')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(formatRs(12500)).toBe('Rs 12,500');
  });

  it('"Fee pending" is center-wide, online claims first, then oldest', () => {
    const claim = { id: 'pay-1', method: 'easypaisa' as const, reference: 'EP1234', amount_pkr: 1000, created_at: '2026-10-28T05:10:00Z' };
    const pending = pendingFees([
      doctor({
        tokens: [
          token({ id: 'a', token_number: 1, created_at: '2026-10-28T05:00:00Z' }),
          token({ id: 'in-line', token_number: 2, status: 'checked_in', payment_status: 'paid' }),
        ],
      }),
      doctor({
        id: 'doc-2',
        name: 'Dr. Bilal',
        fee: 800,
        tokens: [
          token({ id: 'b', token_number: 3, created_at: '2026-10-28T04:00:00Z' }),
          token({ id: 'c', token_number: 4, created_at: '2026-10-28T06:00:00Z', claim }),
          token({ id: 'expired', token_number: 5, status: 'expired' }),
        ],
      }),
    ]);
    expect(pending.map(p => p.token.id)).toEqual(['c', 'b', 'a']);
    expect(pending[0].doctorName).toBe('Dr. Bilal');
    expect(amountDue({ ...pending[0], token: { ...pending[0].token, fee_pkr: null } })).toBe(800);
  });

  it('minutes left and the walk-in toast', () => {
    const now = Date.parse('2026-10-28T05:00:00Z');
    expect(minutesLeft('2026-10-28T05:09:30Z', now)).toBe(10);
    expect(minutesLeft('2026-10-28T04:00:00Z', now)).toBe(0);
    expect(minutesLeft(null, now)).toBeNull();
    expect(walkInMessage({ token_number: 12, payment_status: 'paid' }, 1500, 'cash')).toBe('Token 12 issued · Rs 1,500 Cash');
    expect(walkInMessage({ token_number: 12, payment_status: 'paid', fee_pkr: 900 }, null, 'easypaisa')).toBe('Token 12 issued · Rs 900 Easypaisa');
    expect(walkInMessage({ token_number: 12, payment_status: 'awaiting' }, null, 'cash')).toBe('Token 12 issued · fee pending');
    expect(walkInMessage({ token_number: 12, payment_status: null }, null, 'cash')).toBe('Token 12 issued.');
  });
});

describe('walk-in with fee in one step', () => {
  const sheet = (feeMode: 'before' | 'after', onSubmit = jest.fn().mockResolvedValue({})) => {
    const renderer = render(
      <WalkInSheet visible doctor={{ id: 'doc-1', name: 'Dr. Ayesha', fee: 1500 }} feeMode={feeMode} busy={false} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    return { root: renderer.root, onSubmit };
  };
  const typeName = (root: ReactTestInstance, name: string) =>
    act(() => {
      byId(root, 'walkin-name').props.onChangeText(name);
    });

  it('opens with the doctor fee, Cash and "Fee received" on', () => {
    const { root } = sheet('before');
    expect(has(root, 'walkin-fee')).toBe(true);
    expect(byId(root, 'walkin-amount').props.value).toBe('1500');
    expect(byId(root, 'walkin-fee-received').props.value).toBe(true);
    expect(byId(root, 'walkin-method-cash').props.accessibilityState).toEqual({ selected: true });
    expect(byId(root, 'walkin-method-easypaisa').props.accessibilityState).toEqual({ selected: false });
  });

  it('cash walk-in = name + Issue: token and payment together', async () => {
    const { root, onSubmit } = sheet('before');
    typeName(root, '  Ali Raza ');
    await press(root, 'walkin-issue');
    expect(onSubmit).toHaveBeenCalledWith({ doctorId: 'doc-1', name: 'Ali Raza', phone: null, feeReceived: true, amount: 1500, method: 'cash' });
  });

  it('another method and amount', async () => {
    const { root, onSubmit } = sheet('before');
    typeName(root, 'Ali');
    act(() => {
      byId(root, 'walkin-amount').props.onChangeText('1200');
      byId(root, 'walkin-method-jazzcash').props.onPress();
    });
    await press(root, 'walkin-issue');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feeReceived: true, amount: 1200, method: 'jazzcash' }));
  });

  it('fee later: the token waits in "Fee pending"', async () => {
    const { root, onSubmit } = sheet('before');
    typeName(root, 'Ali');
    act(() => {
      byId(root, 'walkin-fee-received').props.onValueChange(false);
    });
    expect(has(root, 'walkin-amount')).toBe(false);
    expect(texts(root)).toContain('Fee pending');
    await press(root, 'walkin-issue');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feeReceived: false, amount: null }));
  });

  it('a bad amount is caught before sending', async () => {
    const { root, onSubmit } = sheet('before');
    typeName(root, 'Ali');
    act(() => {
      byId(root, 'walkin-amount').props.onChangeText('0');
    });
    await press(root, 'walkin-issue');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(byId(root, 'walkin-amount').props.error).toContain('1 to 1,000,000');
  });

  it('fee after (or no doctor fee): a plain walk-in, no fee fields', async () => {
    const { root, onSubmit } = sheet('after');
    expect(has(root, 'walkin-fee')).toBe(false);
    typeName(root, 'Ali');
    await press(root, 'walkin-issue');
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feeReceived: true, amount: null }));
  });

  it('needs a name', async () => {
    const { root, onSubmit } = sheet('before');
    await press(root, 'walkin-issue');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(byId(root, 'walkin-name').props.error).toBe("Enter the patient's name");
  });
});

describe('fee sheet', () => {
  const pending = { token: token(), doctorName: 'Dr. Ayesha', doctorFee: 1500 };
  const sheet = () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const renderer = render(<FeeSheet pending={pending} busy={false} run={run} onClose={onClose} />);
    return { root: renderer.root, run, onClose };
  };

  it('Paid: the token fee, cash, then closes', async () => {
    const { root, run, onClose } = sheet();
    expect(byId(root, 'fee-amount').props.value).toBe('1000');
    await press(root, 'fee-paid');
    expect(run).toHaveBeenCalledWith({ kind: 'pay', appointmentId: 'appt-1', tokenNumber: 7, amount: 1000, method: 'cash' });
    expect(onClose).toHaveBeenCalled();
  });

  it('method buttons', async () => {
    const { root, run } = sheet();
    act(() => {
      byId(root, 'fee-method-easypaisa').props.onPress();
    });
    await press(root, 'fee-paid');
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pay', method: 'easypaisa' }));
  });

  it('Free needs a reason', async () => {
    const { root, run } = sheet();
    act(() => {
      byId(root, 'fee-free').props.onValueChange(true);
    });
    expect(has(root, 'fee-amount')).toBe(false);
    await press(root, 'fee-paid');
    expect(run).not.toHaveBeenCalled();
    expect(texts(root)).toContain('Choose why the visit is free.');
    act(() => {
      byId(root, 'fee-reason-follow_up').props.onPress();
    });
    await press(root, 'fee-paid');
    expect(run).toHaveBeenCalledWith({ kind: 'waive', appointmentId: 'appt-1', tokenNumber: 7, reason: 'follow_up' });
  });

  it('a failed payment keeps the sheet open', async () => {
    const run = jest.fn().mockRejectedValue(new Error('This transaction ID was already used'));
    const onClose = jest.fn();
    const { root } = render(<FeeSheet pending={pending} busy={false} run={run} onClose={onClose} />);
    await press(root, 'fee-paid');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('"Fee pending" list and online claims', () => {
  const claim = { id: 'pay-9', method: 'easypaisa' as const, reference: 'EP77881234', amount_pkr: 1000, created_at: '2026-10-28T05:10:00Z' };
  const list = () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const onOpen = jest.fn();
    const items = [
      { token: token({ id: 'c', token_number: 9, claim }), doctorName: 'Dr. Ayesha', doctorFee: 1000 },
      { token: token({ id: 'w', token_number: 4, payment_deadline: '2026-10-28T05:12:00Z' }), doctorName: 'Dr. Ayesha', doctorFee: 1000 },
    ];
    const renderer = render(<FeePendingList pending={items} busy={false} run={run} onOpen={onOpen} now={Date.parse('2026-10-28T05:00:00Z')} />);
    return { root: renderer.root, run, onOpen, items };
  };

  it('shows the count, the claim method + TID and minutes left', () => {
    const { root } = list();
    const all = texts(root);
    expect(all).toContain('Fee pending (2)');
    expect(all).toContain('Easypaisa');
    expect(all).toContain('TID EP77881234');
    expect(all).toContain('12 min left');
    expect(has(root, 'claim-9')).toBe(true);
    expect(has(root, 'claim-4')).toBe(false);
  });

  it('tap a row: the fee sheet', () => {
    const { root, onOpen, items } = list();
    act(() => {
      byId(root, 'pending-4').props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });

  it('Verify', async () => {
    const { root, run } = list();
    await press(root, 'verify-9');
    expect(run).toHaveBeenCalledWith({ kind: 'verify', paymentId: 'pay-9', tokenNumber: 9 });
  });

  it('Reject asks why', async () => {
    const { root, run } = list();
    act(() => {
      byId(root, 'reject-9').props.onPress();
    });
    expect(run).not.toHaveBeenCalled();
    await press(root, 'reject-wrong_amount');
    expect(run).toHaveBeenCalledWith({ kind: 'reject', paymentId: 'pay-9', tokenNumber: 9, reason: 'wrong_amount' });
  });

  it('nothing pending: nothing shown', () => {
    const { root } = render(<FeePendingList pending={[]} busy={false} run={jest.fn()} onOpen={jest.fn()} />);
    expect(has(root, 'fee-pending')).toBe(false);
  });
});

describe('owner Today screen', () => {
  const center = { id: 'c1', name: 'Shifa Clinic', organizationId: 'org-1', organizationName: 'Shifa', isOwner: true };
  const report = {
    from: '2026-10-28',
    to: '2026-10-28',
    today: '2026-10-28',
    timezone: 'Asia/Karachi',
    can_range: false,
    is_owner: true,
    totals: {
      patients: 23,
      paid: 18,
      total_pkr: 21500,
      cash_pkr: 15000,
      online_pkr: 6500,
      card_pkr: 0,
      other_pkr: 0,
      free: 3,
      refunded: 0,
      refunded_pkr: 0,
      claims: 1,
    },
    cash_closing: [
      { user_id: 'u1', name: 'Rabia', count: 9, cash_pkr: 9000 },
      { user_id: 'u2', name: 'Kashif', count: 6, cash_pkr: 6000 },
    ],
  };
  const claim = { id: 'pay-1', method: 'jazzcash' as const, reference: 'JC1', amount_pkr: 1000, created_at: '2026-10-28T05:00:00Z' };

  beforeEach(() => {
    (useReception as jest.Mock).mockReturnValue({
      centers: [center],
      center,
      selectCenter: jest.fn(),
      queue: { doctors: [doctor({ tokens: [token({ claim })] })] },
      dataUpdatedAt: 1,
    });
    (useTodayReport as jest.Mock).mockReturnValue({ data: report, error: null, isRefetching: false, refetch: jest.fn() });
  });

  it("today's cards: patients, total, cash, online, free", () => {
    const { root } = render(<OwnerHomeScreen />);
    const label = (key: string) => byId(root, `stat-${key}`).props.accessibilityLabel;
    expect(label('patients')).toBe('Patients: 23');
    expect(label('total')).toBe('Total: Rs 21,500');
    expect(label('cash')).toBe('Cash: Rs 15,000');
    expect(label('online')).toBe('Online: Rs 6,500');
    expect(label('free')).toBe('Free: 3');
  });

  it('cash per receptionist', () => {
    const { root } = render(<OwnerHomeScreen />);
    const all = texts(root);
    expect(root.findAll(n => n.props.testID === 'cash-person' && typeof n.type === 'string')).toHaveLength(2);
    expect(all).toContain('Rabia');
    expect(all).toContain('Rs 9,000');
    expect(all).toContain('Kashif');
    expect(all).toContain('9 payments');
  });

  it('an online claim waiting: a shortcut to the desk', () => {
    const { root } = render(<OwnerHomeScreen />);
    expect(texts(root)).toContain('1 online payment to check');
    act(() => {
      byId(root, 'owner-claims').props.onPress();
    });
    expect(jest.requireMock('@react-navigation/native').__navigate).toHaveBeenCalledWith('ReceptionTab');
  });

  it('"Detailed report web pe dekhein" opens Hisaab for this center in the browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { root } = render(<OwnerHomeScreen />);
    expect(byId(root, 'open-hisaab').props.title).toBe(OPEN_HISAAB);
    expect(OPEN_HISAAB).toBe('Detailed report web pe dekhein');
    await press(root, 'open-hisaab');
    expect(open).toHaveBeenCalledWith('https://app.mediq.pk/hisaab?center=c1&from=app');
  });

  it('never links to plan purchase or payment pages (Google Play)', () => {
    const { root } = render(<OwnerHomeScreen />);
    expect(texts(root)).not.toMatch(/upgrade|buy|choose a plan|\/settings\/plan|pay now/i);
    expect(hisaabUrl('x')).not.toMatch(/plan|pay|billing|settings/);
  });

  it('loading: skeletons, no numbers yet', () => {
    (useTodayReport as jest.Mock).mockReturnValue({ data: undefined, error: null, isRefetching: false, refetch: jest.fn() });
    const { root } = render(<OwnerHomeScreen />);
    expect(has(root, 'owner-stats')).toBe(false);
    expect(has(root, 'skeleton')).toBe(true);
  });
});

describe('desk RPCs', () => {
  const rpc = supabase.rpc as unknown as jest.Mock;
  beforeEach(() => rpc.mockReset());

  it('walk-ins go through issue_walk_in (never the fee-skipping issue_token)', async () => {
    rpc.mockResolvedValue({ data: [{ token_number: 12, public_code: 'ABCD2345', payment_status: 'paid' }], error: null });
    const issued = await queueRpc.issueWalkIn({ doctorId: 'd', name: 'Ali', phone: null, feeReceived: true, amount: 1500, method: 'cash' });
    expect(issued.token_number).toBe(12);
    expect(rpc).toHaveBeenCalledWith('issue_walk_in', {
      p_doctor_id: 'd',
      p_name: 'Ali',
      p_phone: null,
      p_fee_received: true,
      p_amount: 1500,
      p_method: 'cash',
    });
    await queueRpc.issueWalkIn({ doctorId: 'd', name: 'Ali', phone: null, feeReceived: false, amount: 1500, method: 'cash' });
    expect(rpc).toHaveBeenLastCalledWith('issue_walk_in', expect.objectContaining({ p_fee_received: false, p_amount: null }));
    expect(rpc.mock.calls.some(([fn]) => fn === 'issue_token')).toBe(false);
  });

  it('fee sheet, claims and the report', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await queueRpc.recordPayment('a', 1000, 'cash');
    await queueRpc.waiveFee('a', 'discount');
    await queueRpc.verifyClaim('p', true);
    await queueRpc.verifyClaim('p', false, 'not_received');
    await queueRpc.getTodayReport('c');
    expect(rpc.mock.calls).toEqual([
      ['record_payment', { p_appointment_id: 'a', p_amount: 1000, p_method: 'cash' }],
      ['waive_fee', { p_appointment_id: 'a', p_reason: 'discount' }],
      ['verify_claim', { p_payment_id: 'p', p_accept: true, p_reason: null }],
      ['verify_claim', { p_payment_id: 'p', p_accept: false, p_reason: 'not_received' }],
      ['get_payment_report', { p_center_id: 'c', p_from: null, p_to: null, p_doctor_id: null }],
    ]);
  });

  it('errors keep their code (the toast reads it)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Token #7 is already paid', code: 'PT409' } });
    await expect(queueRpc.recordPayment('a', 1000, 'cash')).rejects.toMatchObject({ code: 'PT409' });
  });
});

describe('staff pushes', () => {
  it('are told apart from patient pushes (no QueueStatus screen on the staff side)', () => {
    expect(isStaffPush({ type: 'fee_claim', appointment_id: 'a' })).toBe(true);
    expect(isStaffPush({ type: 'paid_waiting' })).toBe(true);
    expect(isStaffPush({ appointmentId: 'a' })).toBe(false);
    expect(isStaffPush(undefined)).toBe(false);
  });
});

declare const __dirname: string;
describe('no walk-in path skips the fee', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string; readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[] };
  const path = require('path') as { join(...p: string[]): string };
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

  it('the app never calls issue_token', () => {
    const offending = files(path.join(__dirname, '..', 'src'))
      .filter(f => !f.endsWith('database.types.ts'))
      .filter(f => /['"]issue_token['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(offending).toEqual([]);
  });
});
