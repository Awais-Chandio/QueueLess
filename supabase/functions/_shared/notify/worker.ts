// The outbox worker: claim -> choose channel -> charge once -> send -> record.
// Database rules live in the worker RPCs (20261022110000_notification_outbox.sql);
// this file only orders the calls. Safe to run twice at once (rows are locked
// by claim) and safe to crash at any point:
//   - before begin: the lock expires, the row is claimed again, nothing charged
//   - after begin, before finish: claimed again, begin returns the same charge
//     (charged: false), the message may go out twice but is paid for once

import { renderMessage, type Language, type NotifyEvent, type NotifyPayload } from './templates.ts';
import type { Channel, MessageProvider } from './providers.ts';

export interface ClaimedRow {
  id: string;
  organization_id: string;
  appointment_id: string | null;
  event: NotifyEvent;
  to_phone: string;
  language: Language;
  payload: NotifyPayload;
  attempts: number;
  max_attempts: number;
  channel: Channel | null;
  message_log_id: string | null;
  modules: string[];
}

export type BeginResult = { message_log_id: string; channel: Channel; charged: boolean } | { skipped: true; reason: string };

/** The worker RPCs, as the Edge Function calls them with the service role. */
export interface WorkerRpc {
  claim(limit: number): Promise<ClaimedRow[]>;
  begin(id: string, channel: Channel, cost: number): Promise<BeginResult>;
  finish(id: string, ok: boolean, providerMessageId: string | null, error: string | null, retryable: boolean): Promise<string>;
  skip(id: string, reason: string): Promise<void>;
}

export interface WorkerOptions {
  rpc: WorkerRpc;
  providers: Partial<Record<Channel, MessageProvider>>;
  costs: Record<Channel, number>;
  siteUrl: string;
  /** Preferred channels in order, e.g. ['whatsapp', 'sms']. */
  channelOrder?: Channel[];
  batchSize?: number;
  /** Stop claiming new batches after this (ms since epoch). */
  deadline: number;
  now?: () => number;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export interface WorkerSummary {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
  errors: number;
}

/** First channel in order that the clinic's plan includes and this deployment can send. */
export const chooseChannel = (
  modules: string[],
  providers: Partial<Record<Channel, MessageProvider>>,
  order: Channel[] = ['whatsapp', 'sms'],
): Channel | null => order.find(channel => modules.includes(channel) && !!providers[channel]) ?? null;

export const runWorker = async (options: WorkerOptions): Promise<WorkerSummary> => {
  const { rpc, providers, costs, siteUrl, channelOrder, batchSize = 20, deadline } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const summary: WorkerSummary = { claimed: 0, sent: 0, retrying: 0, failed: 0, skipped: 0, errors: 0 };

  const processRow = async (row: ClaimedRow) => {
    // A row charged on an earlier attempt keeps that channel.
    const channel = row.channel ?? chooseChannel(row.modules, providers, channelOrder);
    if (!channel) {
      await rpc.skip(row.id, 'No message channel for this clinic (plan or provider)');
      summary.skipped++;
      return;
    }
    const provider = providers[channel];
    if (!provider) {
      // Charged before, provider since removed: try again later.
      await rpc.finish(row.id, false, null, `${channel} provider not configured`, true);
      summary.retrying++;
      return;
    }

    const begun = await rpc.begin(row.id, channel, costs[channel]);
    if ('skipped' in begun) {
      log('skipped', { id: row.id, reason: begun.reason });
      summary.skipped++;
      return;
    }

    const message = renderMessage(row.event, row.language, row.payload, siteUrl);
    const result = await provider.send({ to: row.to_phone, event: row.event, language: row.language, message });
    const state = result.ok
      ? await rpc.finish(row.id, true, result.id, null, false)
      : await rpc.finish(row.id, false, null, result.error, result.retryable);

    if (state === 'sent') summary.sent++;
    else if (state === 'pending') summary.retrying++;
    else if (state === 'failed') summary.failed++;
    if (!result.ok) log('send failed', { id: row.id, channel, error: result.error, retryable: result.retryable, state });
  };

  while (now() < deadline) {
    const rows = await rpc.claim(batchSize);
    if (rows.length === 0) break;
    summary.claimed += rows.length;
    for (const row of rows) {
      // Out of time: unprocessed rows keep their lock and are claimed again later.
      if (now() >= deadline) break;
      try {
        await processRow(row);
      } catch (error) {
        summary.errors++;
        log('row error', { id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (rows.length < batchSize) break;
  }
  return summary;
};
