import type {
  FeeMode,
  OnlineMethod,
  PayMethod,
  QueueToken,
  ReceptionDoctor,
  RejectReason,
  WaiveReason,
} from '../../queue/api/queueRpc';
import { isAwaitingPayment } from '../../queue/utils/queueState';

// The desk's fee rules, as on the web reception (mediq-web
// src/app/reception/Fees.tsx): cash first, Free needs a reason, a claim is
// verified or rejected with a reason.

export const DESK_METHODS: PayMethod[] = ['cash', 'easypaisa', 'jazzcash', 'bank', 'card'];
export const WAIVE_REASONS: WaiveReason[] = ['follow_up', 'staff_family', 'discount', 'other'];
export const REJECT_REASONS: RejectReason[] = ['not_received', 'wrong_amount', 'other'];

export const METHOD_LABEL: Record<PayMethod | OnlineMethod, string> = {
  cash: 'Cash',
  easypaisa: 'Easypaisa',
  jazzcash: 'JazzCash',
  bank: 'Bank',
  card: 'Card',
  other: 'Other',
};

export const WAIVE_LABEL: Record<WaiveReason, string> = {
  follow_up: 'Follow-up',
  staff_family: 'Staff / family',
  discount: 'Discount',
  other: 'Other',
};

export const REJECT_LABEL: Record<RejectReason, string> = {
  not_received: 'Not received',
  wrong_amount: 'Wrong amount',
  other: 'Other',
};

/** The walk-in takes the fee in the same step: fee before and a doctor with a fee. */
export const walkInTakesFee = (feeMode: FeeMode | undefined, doctorFee: number | undefined) =>
  feeMode === 'before' && (doctorFee ?? 0) > 0;

/** "1,500" (the app is English; rupees are whole numbers). */
export const formatRs = (amount: number) => `Rs ${Math.round(amount).toLocaleString('en-US')}`;

/** A typed amount: whole rupees 1..1,000,000, else null. */
export const parseAmount = (text: string): number | null => {
  const value = Number(text.replace(/[,\s]/g, ''));
  return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : null;
};

export interface PendingFee {
  token: QueueToken;
  doctorName: string;
  doctorFee: number;
}

/** The amount to ask for: what the token was issued with, else the doctor's fee now. */
export const amountDue = (pending: PendingFee) => pending.token.fee_pkr || pending.doctorFee || 0;

/** "Fee pending" for the whole center: online claims first (someone paid and waits), then oldest first. */
export const pendingFees = (doctors: ReceptionDoctor[]): PendingFee[] =>
  doctors
    .flatMap(doctor =>
      doctor.tokens.filter(isAwaitingPayment).map(token => ({ token, doctorName: doctor.name, doctorFee: doctor.fee ?? 0 })),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.token.claim)) - Number(Boolean(a.token.claim)) || a.token.created_at.localeCompare(b.token.created_at),
    );

/** Whole minutes before an unpaid token expires; null when it has no deadline. */
export const minutesLeft = (deadline: string | null | undefined, now: number = Date.now()) =>
  deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 60_000)) : null;

/** The toast after a walk-in, by what happened to the fee. */
export const walkInMessage = (
  issued: { token_number: number; payment_status?: string | null; fee_pkr?: number | null },
  amount: number | null,
  method: PayMethod,
) => {
  if (issued.payment_status === 'paid') {
    return `Token ${issued.token_number} issued · ${formatRs(amount ?? issued.fee_pkr ?? 0)} ${METHOD_LABEL[method]}`;
  }
  if (issued.payment_status === 'awaiting') return `Token ${issued.token_number} issued · fee pending`;
  return `Token ${issued.token_number} issued.`;
};
