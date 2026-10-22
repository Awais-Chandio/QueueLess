// send-notifications: sends the patient SMS / WhatsApp messages queued in
// notification_outbox. Called every minute by pg_cron (private.kick_notification_worker)
// with the shared secret in x-worker-secret; deployed with --no-verify-jwt.
//
// Secrets (supabase secrets set ...):
//   NOTIFY_WORKER_SECRET        same value as the Vault secret notifications_worker_secret
//   PUBLIC_SITE_URL             web app origin for status links, e.g. https://app.mediq.pk
//   SMS_*                       generic HTTP SMS gateway (see _shared/notify/providers.ts)
//   WHATSAPP_*                  WhatsApp Cloud API (optional)
//   SMS_CREDIT_COST / WHATSAPP_CREDIT_COST   credits per message (default 1)
//   NOTIFY_CHANNEL_ORDER        e.g. "whatsapp,sms" (default) or "sms"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { providersFromEnv, type Channel } from '../_shared/notify/providers.ts';
import { runWorker, type BeginResult, type ClaimedRow, type WorkerRpc } from '../_shared/notify/worker.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Constant-time string comparison (no early exit on the first difference). */
const safeEqual = (a: string, b: string) => {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('NOTIFY_WORKER_SECRET');
  if (!secret) return json({ error: 'NOTIFY_WORKER_SECRET is not set' }, 500);
  if (!safeEqual(req.headers.get('x-worker-secret') ?? '', secret)) return json({ error: 'Forbidden' }, 403);

  const env = Deno.env.toObject();
  const supabase = createClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };

  const rpc: WorkerRpc = {
    claim: limit => call<ClaimedRow[]>('claim_notifications', { p_limit: limit, p_lock_seconds: 120 }).then(rows => rows ?? []),
    begin: (id, channel, cost) => call<BeginResult>('begin_notification_send', { p_outbox_id: id, p_channel: channel, p_cost: cost }),
    finish: (id, ok, providerMessageId, error, retryable) =>
      call<string>('finish_notification_send', {
        p_outbox_id: id,
        p_ok: ok,
        p_provider_message_id: providerMessageId,
        p_error: error,
        p_retryable: retryable,
      }),
    skip: async (id, reason) => {
      await call<null>('skip_notification', { p_outbox_id: id, p_reason: reason });
    },
  };

  const providers = providersFromEnv(env, fetch);
  const channelOrder = (env.NOTIFY_CHANNEL_ORDER || 'whatsapp,sms')
    .split(',')
    .map(c => c.trim())
    .filter((c): c is Channel => c === 'sms' || c === 'whatsapp');

  try {
    const summary = await runWorker({
      rpc,
      providers,
      channelOrder,
      costs: { sms: Number(env.SMS_CREDIT_COST || 1), whatsapp: Number(env.WHATSAPP_CREDIT_COST || 1) },
      siteUrl: env.PUBLIC_SITE_URL || 'https://app.mediq.pk',
      // pg_net waits 55s; stop claiming well before that.
      deadline: Date.now() + 40_000,
      log: (message, extra) => console.log(`[send-notifications] ${message}`, extra ?? ''),
    });
    console.log('[send-notifications] done', summary);
    return json({ ok: true, providers: Object.keys(providers), ...summary });
  } catch (error) {
    console.error('[send-notifications] failed', error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
