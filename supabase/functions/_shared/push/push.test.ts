// Jest (runs with the app's suite): the FCM service-account JWT, error
// handling, the message body, and the push worker against in-memory RPCs.
import { classifyFcmError, createFcmSender, fcmBody, pemToPkcs8, serviceAccountFromEnv, signServiceJwt, type SendResult } from './fcm.ts';
import { pushTag, runPushWorker, toMessage, type ClaimedPush, type PushRpc } from './worker.ts';

declare function require(id: string): any;
const nodeCrypto = require('crypto');
const Buffer: { from(data: unknown, encoding?: string): { toString(encoding?: string): string } } = require('buffer').Buffer;
const subtle: SubtleCrypto = nodeCrypto.webcrypto.subtle;

const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM: string = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const account = { projectId: 'mediq-test', clientEmail: 'push@mediq-test.iam.gserviceaccount.com', privateKey: PEM };

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('FCM service account', () => {
  it('signs an RS256 JWT for the messaging scope that verifies with the public key', async () => {
    const jwt = await signServiceJwt(account, 1_800_000_000, subtle);
    const [header, claims, signature] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: account.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const ok = nodeCrypto.verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
  });

  it('reads a key pasted with literal \\n escapes (how dashboards store it)', () => {
    const escaped = PEM.replace(/\n/g, '\\n');
    expect(Buffer.from(pemToPkcs8(escaped))).toEqual(Buffer.from(pemToPkcs8(PEM)));
  });

  it('is off unless all three secrets are set', () => {
    expect(serviceAccountFromEnv({ FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e' })).toBeNull();
    expect(serviceAccountFromEnv({ FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'k' })).toEqual({
      projectId: 'p',
      clientEmail: 'e',
      privateKey: 'k',
    });
  });
});

describe('FCM errors', () => {
  const fcmError = (status: string, errorCode?: string) => ({
    error: { status, message: 'x', details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] },
  });

  it('a gone device is forgotten, not retried', () => {
    expect(classifyFcmError(404, fcmError('NOT_FOUND', 'UNREGISTERED'))).toMatchObject({ tokenGone: true, retryable: false });
    expect(classifyFcmError(403, fcmError('PERMISSION_DENIED', 'SENDER_ID_MISMATCH'))).toMatchObject({ tokenGone: true });
  });

  it('busy / down / expired auth: retried', () => {
    expect(classifyFcmError(429, fcmError('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'))).toMatchObject({ retryable: true, tokenGone: false });
    expect(classifyFcmError(503, fcmError('UNAVAILABLE', 'UNAVAILABLE'))).toMatchObject({ retryable: true });
    expect(classifyFcmError(401, null)).toMatchObject({ retryable: true });
  });

  it('a bad message: failed, token kept', () => {
    expect(classifyFcmError(400, fcmError('INVALID_ARGUMENT', 'INVALID_ARGUMENT'))).toEqual({
      retryable: false,
      tokenGone: false,
      error: 'INVALID_ARGUMENT: x',
    });
  });
});

describe('FCM sender', () => {
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  it('gets one access token per run and sends a high-priority notification with data', async () => {
    const calls: { url: string; body: string; auth?: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body), auth: (init?.headers as Record<string, string>)?.Authorization });
      if (url.includes('oauth2')) return json(200, { access_token: 'ya29.test' });
      return json(200, { name: 'projects/mediq-test/messages/1' });
    };
    const send = createFcmSender(account, fetchImpl, subtle, () => 1_800_000_000_000);
    const message = { title: 'Online payment to check', body: 'Token 7', data: { type: 'fee_claim' }, tag: 'fee_claim:p1' };
    expect(await send('tok-1', message)).toEqual({ ok: true, id: 'projects/mediq-test/messages/1' });
    expect(await send('tok-2', message)).toMatchObject({ ok: true });

    expect(calls.filter(c => c.url.includes('oauth2'))).toHaveLength(1);
    const sent = calls.filter(c => c.url.endsWith('/v1/projects/mediq-test/messages:send'));
    expect(sent).toHaveLength(2);
    expect(sent[0].auth).toBe('Bearer ya29.test');
    expect(JSON.parse(sent[0].body)).toEqual(fcmBody('tok-1', message));
    expect(fcmBody('tok-1', message).message.android).toEqual({ priority: 'HIGH', notification: { sound: 'default', tag: 'fee_claim:p1' } });
  });

  it('auth failure: retryable, and tried again on the next send', async () => {
    let tokenCalls = 0;
    const fetchImpl = async (url: string) => {
      if (url.includes('oauth2')) {
        tokenCalls++;
        return tokenCalls === 1 ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'ok' });
      }
      return json(200, { name: 'n' });
    };
    const send = createFcmSender(account, fetchImpl, subtle);
    expect(await send('t', { title: 't', body: 'b', data: {} })).toMatchObject({ ok: false, retryable: true, error: expect.stringContaining('invalid_grant') });
    expect(await send('t', { title: 't', body: 'b', data: {} })).toMatchObject({ ok: true });
  });
});

describe('push worker', () => {
  const row = (over: Partial<ClaimedPush> = {}): ClaimedPush => ({
    id: 'p1',
    user_id: 'u1',
    kind: 'fee_claim',
    title: 'Online payment to check',
    body: 'Token 7 · Sana · Easypaisa Rs 1,000 · TID EP1234',
    data: { type: 'fee_claim', payment_id: 'pay-1', center_id: 'c1' },
    attempts: 1,
    max_attempts: 4,
    tokens: ['tok-a', 'tok-b'],
    ...over,
  });

  const fakeRpc = (batches: ClaimedPush[][]) => {
    const finished: { id: string; ok: boolean; error: string | null; retryable: boolean }[] = [];
    const forgotten: string[] = [];
    const rpc: PushRpc = {
      claim: async () => batches.shift() ?? [],
      finish: async (id, ok, error, retryable) => {
        finished.push({ id, ok, error, retryable });
        return ok ? 'sent' : retryable ? 'pending' : 'failed';
      },
      forget: async tokens => {
        forgotten.push(...tokens);
        return tokens.length;
      },
    };
    return { rpc, finished, forgotten };
  };

  it('tags: each claim stands alone; a doctor\'s "waiting" pushes replace each other', () => {
    expect(pushTag(row())).toBe('fee_claim:pay-1');
    expect(pushTag(row({ kind: 'paid_waiting', data: { type: 'paid_waiting', doctor_id: 'd1' } }))).toBe('paid_waiting:d1');
    expect(toMessage(row()).data).toEqual({ type: 'fee_claim', payment_id: 'pay-1', center_id: 'c1' });
  });

  it('sent when one device gets it; gone devices are forgotten', async () => {
    const { rpc, finished, forgotten } = fakeRpc([[row()]]);
    const send = async (token: string): Promise<SendResult> =>
      token === 'tok-a' ? { ok: false, error: 'UNREGISTERED', retryable: false, tokenGone: true } : { ok: true, id: 'm1' };
    const summary = await runPushWorker({ rpc, send, deadline: Date.now() + 10_000 });
    expect(finished).toEqual([{ id: 'p1', ok: true, error: null, retryable: false }]);
    expect(forgotten).toEqual(['tok-a']);
    expect(summary).toMatchObject({ claimed: 1, sent: 1, tokensForgotten: 1 });
  });

  it('every device failed: retried if any failure is retryable', async () => {
    const { rpc, finished } = fakeRpc([[row()]]);
    const send = async (token: string): Promise<SendResult> =>
      token === 'tok-a'
        ? { ok: false, error: 'INVALID_ARGUMENT', retryable: false, tokenGone: false }
        : { ok: false, error: 'UNAVAILABLE', retryable: true, tokenGone: false };
    const summary = await runPushWorker({ rpc, send, deadline: Date.now() + 10_000 });
    expect(finished).toEqual([{ id: 'p1', ok: false, error: 'INVALID_ARGUMENT', retryable: true }]);
    expect(summary.retrying).toBe(1);
  });

  it('FCM not configured: claimed rows are failed with the reason (no pile-up)', async () => {
    const { rpc, finished } = fakeRpc([[row(), row({ id: 'p2' })]]);
    const summary = await runPushWorker({ rpc, send: null, deadline: Date.now() + 10_000 });
    expect(finished.map(f => [f.id, f.ok, f.retryable])).toEqual([
      ['p1', false, false],
      ['p2', false, false],
    ]);
    expect(finished[0].error).toContain('FIREBASE_');
    expect(summary.failed).toBe(2);
  });

  it('keeps claiming full batches until empty, and stops at the deadline', async () => {
    const full = [row({ id: 'a' }), row({ id: 'b' })];
    const { rpc, finished } = fakeRpc([full, [row({ id: 'c' })]]);
    const send = async (): Promise<SendResult> => ({ ok: true, id: 'm' });
    await runPushWorker({ rpc, send, deadline: Date.now() + 10_000, batchSize: 2 });
    expect(finished.map(f => f.id)).toEqual(['a', 'b', 'c']);

    const late = fakeRpc([[row({ id: 'x' })]]);
    const summary = await runPushWorker({ rpc: late.rpc, send, deadline: Date.now() - 1 });
    expect(summary.claimed).toBe(0);
    expect(late.finished).toEqual([]);
  });

  it('a throwing row is counted and the rest still go', async () => {
    const { rpc, finished } = fakeRpc([[row({ id: 'bad', tokens: ['boom'] }), row({ id: 'good' })]]);
    const send = async (token: string): Promise<SendResult> => {
      if (token === 'boom') throw new Error('network');
      return { ok: true, id: 'm' };
    };
    const summary = await runPushWorker({ rpc, send, deadline: Date.now() + 10_000 });
    expect(summary.errors).toBe(1);
    expect(finished.map(f => f.id)).toEqual(['good']);
  });
});
