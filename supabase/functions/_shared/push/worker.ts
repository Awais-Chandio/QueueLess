// The staff push worker: claim -> FCM to each of the person's devices ->
// record. Database rules live in the RPCs (20261028120100_staff_push.sql).
// Safe to run twice at once (claim locks rows) and to crash anywhere (the
// lock expires and the row is claimed again; at worst a push repeats).

import type { PushMessage, PushSender } from './fcm.ts';

export type PushKind = 'fee_claim' | 'paid_waiting';

export interface ClaimedPush {
  id: string;
  user_id: string;
  kind: PushKind;
  title: string;
  body: string;
  data: Record<string, string>;
  attempts: number;
  max_attempts: number;
  tokens: string[];
}

export interface PushRpc {
  claim(limit: number): Promise<ClaimedPush[]>;
  finish(id: string, ok: boolean, error: string | null, retryable: boolean): Promise<string>;
  forget(tokens: string[]): Promise<number>;
}

export interface PushSummary {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  tokensForgotten: number;
  errors: number;
}

/**
 * A claim stays on its own (every claim needs a Verify / Reject); a doctor's
 * "waiting" pushes replace each other, so the phone shows the latest one.
 */
export const pushTag = (row: Pick<ClaimedPush, 'kind' | 'data'>) =>
  row.kind === 'fee_claim' ? `fee_claim:${row.data.payment_id ?? ''}` : `paid_waiting:${row.data.doctor_id ?? ''}`;

export const toMessage = (row: ClaimedPush): PushMessage => ({
  title: row.title,
  body: row.body,
  data: Object.fromEntries(Object.entries(row.data ?? {}).map(([k, v]) => [k, String(v)])),
  tag: pushTag(row),
});

export const runPushWorker = async (options: {
  rpc: PushRpc;
  /** null: FCM isn't configured; claimed rows are marked failed so the outbox doesn't pile up. */
  send: PushSender | null;
  deadline: number;
  batchSize?: number;
  now?: () => number;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}): Promise<PushSummary> => {
  const { rpc, send, deadline, batchSize = 50 } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const summary: PushSummary = { claimed: 0, sent: 0, retrying: 0, failed: 0, tokensForgotten: 0, errors: 0 };

  const record = (state: string) => {
    if (state === 'sent') summary.sent++;
    else if (state === 'pending') summary.retrying++;
    else if (state === 'failed') summary.failed++;
  };

  const processRow = async (row: ClaimedPush) => {
    if (!send) {
      record(await rpc.finish(row.id, false, 'FCM is not configured (FIREBASE_* secrets)', false));
      return;
    }
    const message = toMessage(row);
    const results = await Promise.all(row.tokens.map(async token => ({ token, result: await send(token, message) })));
    const gone = results.filter(r => !r.result.ok && r.result.tokenGone).map(r => r.token);
    if (gone.length > 0) summary.tokensForgotten += await rpc.forget(gone);

    if (results.some(r => r.result.ok)) {
      record(await rpc.finish(row.id, true, null, false));
      return;
    }
    const failures = results.map(r => r.result).filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
    const retryable = failures.some(f => f.retryable);
    const error = failures[0]?.error ?? 'no device';
    record(await rpc.finish(row.id, false, error, retryable));
    log('push failed', { id: row.id, kind: row.kind, error, retryable });
  };

  while (now() < deadline) {
    const rows = await rpc.claim(batchSize);
    if (rows.length === 0) break;
    summary.claimed += rows.length;
    for (const row of rows) {
      if (now() >= deadline) break;
      try {
        await processRow(row);
      } catch (error) {
        summary.errors++;
        log('push row error', { id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (rows.length < batchSize) break;
  }
  return summary;
};
