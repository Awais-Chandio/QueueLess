// Jest (runs with the app's suite): templates, phone formats, providers and
// the worker loop against an in-memory stand-in for the worker RPCs.
import { EVENTS, clinicTime, renderMessage, statusLink, type NotifyPayload } from './templates.ts';
import { DEFAULT_SMS_BODY, createHttpSmsProvider, createWhatsAppProvider, formatPhone, type MessageProvider } from './providers.ts';
import { chooseChannel, runWorker, type BeginResult, type ClaimedRow, type WorkerRpc } from './worker.ts';

const payload: NotifyPayload = {
  token_number: 12,
  public_code: 'ABCD2345',
  clinic_name: 'City Clinic',
  doctor_name: 'Dr. Ayesha',
  room: 'Room 2',
  timezone: 'Asia/Karachi',
  people_ahead: 4,
  late_until: '2026-10-22T09:45:00Z',
};
const SITE = 'https://app.mediq.pk/';

describe('templates', () => {
  it.each(EVENTS.flatMap(event => [[event, 'ur'], [event, 'en']] as const))('%s (%s) renders without gaps', (event, language) => {
    const { text, params } = renderMessage(event, language, payload, SITE);
    expect(text).toContain('City Clinic');
    expect(text).toContain('12');
    expect(text).not.toMatch(/undefined|null|\{\{/);
    expect(params.length).toBeGreaterThanOrEqual(3);
    expect(params.every(p => p.length > 0)).toBe(true);
    if (language === 'ur') expect(text).toMatch(/[؀-ۿ]/);
  });

  it('token issued carries the status link and how many are ahead', () => {
    expect(renderMessage('token_issued', 'en', payload, SITE).text).toBe(
      'City Clinic: Your token is 12 for Dr. Ayesha. 4 people are ahead of you. Track your turn: https://app.mediq.pk/t/ABCD2345',
    );
    expect(renderMessage('token_issued', 'en', { ...payload, people_ahead: 0 }, SITE).text).toContain("You're next.");
    expect(renderMessage('token_issued', 'ur', { ...payload, people_ahead: 1 }, SITE).text).toContain('آپ سے پہلے 1 مریض ہے');
    expect(renderMessage('token_issued', 'en', payload, SITE).params).toEqual(['City Clinic', '12', 'Dr. Ayesha', '4', 'https://app.mediq.pk/t/ABCD2345']);
  });

  it('late time is shown in the clinic time zone', () => {
    expect(clinicTime('2026-10-22T09:45:00Z', 'Asia/Karachi')).toBe('2:45 PM');
    expect(renderMessage('doctor_late', 'en', payload, SITE).text).toContain('around 2:45 PM');
    expect(renderMessage('doctor_late', 'ur', payload, SITE).text).toContain('2:45 PM');
  });

  it('falls back to neutral words for missing names', () => {
    const bare = { token_number: 3, public_code: null, clinic_name: null, doctor_name: null, room: null };
    expect(renderMessage('your_turn', 'en', bare, SITE).text).toBe("Clinic: It's your turn! Token 3, please go to the doctor (the doctor's room) now.");
    expect(statusLink('https://x.pk', null)).toBe('https://x.pk');
  });
});

describe('formatPhone', () => {
  it('normalises Pakistani numbers as typed at the desk', () => {
    expect(formatPhone('03001234567')).toBe('923001234567');
    expect(formatPhone('+92 300 1234567')).toBe('923001234567');
    expect(formatPhone('00923001234567')).toBe('923001234567');
    expect(formatPhone('923001234567')).toBe('923001234567');
    expect(formatPhone('03001234567', 'e164')).toBe('+923001234567');
    expect(formatPhone('+923001234567', 'local')).toBe('03001234567');
  });
});

type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
const fakeFetch = (status: number, body: string, calls: Call[] = []) =>
  jest.fn(async (url: string, init?: Call['init']) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  });

const msg = (text = 'Hello "world"\nنیا') => ({
  to: '03001234567',
  event: 'token_issued' as const,
  language: 'en' as const,
  message: { text, params: ['a', 'b'] },
});

describe('generic HTTP SMS provider', () => {
  it('is off without a URL', () => {
    expect(createHttpSmsProvider({}, fakeFetch(200, ''))).toBeNull();
  });

  it('posts the default JSON body with the text escaped', async () => {
    const calls: Call[] = [];
    const sms = createHttpSmsProvider({ SMS_HTTP_URL: 'https://sms.test/send', SMS_SENDER: 'MediQ', SMS_HTTP_HEADERS: '{"Authorization":"Bearer k"}', SMS_HTTP_ID_FIELD: 'data.id' },
      fakeFetch(200, '{"data":{"id":"m-1"}}', calls))!;
    expect(await sms.send(msg())).toEqual({ ok: true, id: 'm-1' });
    expect(DEFAULT_SMS_BODY).toContain('{{text}}');
    expect(JSON.parse(calls[0].init!.body!)).toEqual({ to: '923001234567', message: 'Hello "world"\nنیا', sender: 'MediQ' });
    expect(calls[0].init!.headers).toMatchObject({ Authorization: 'Bearer k', 'Content-Type': 'application/json' });
  });

  it('form-encodes and supports GET gateways', async () => {
    const calls: Call[] = [];
    const form = createHttpSmsProvider({ SMS_HTTP_URL: 'https://sms.test/send', SMS_HTTP_CONTENT_TYPE: 'application/x-www-form-urlencoded', SMS_HTTP_BODY: 'to={{to}}&msg={{text}}', SMS_PHONE_FORMAT: 'local' }, fakeFetch(200, 'OK', calls))!;
    await form.send(msg('a b&c'));
    expect(calls[0].init!.body).toBe('to=03001234567&msg=a%20b%26c');
    const get = createHttpSmsProvider({ SMS_HTTP_URL: 'https://sms.test/send?key=1', SMS_HTTP_METHOD: 'GET', SMS_HTTP_BODY: 'to={{to}}&msg={{text}}' }, fakeFetch(200, 'OK', calls))!;
    await get.send(msg('hi'));
    expect(calls[1].url).toBe('https://sms.test/send?key=1&to=923001234567&msg=hi');
    expect(calls[1].init!.body).toBeUndefined();
  });

  it('classifies failures for retry', async () => {
    const env = { SMS_HTTP_URL: 'https://sms.test/send' };
    expect(await createHttpSmsProvider(env, fakeFetch(503, 'busy'))!.send(msg())).toMatchObject({ ok: false, retryable: true });
    expect(await createHttpSmsProvider(env, fakeFetch(429, 'slow down'))!.send(msg())).toMatchObject({ ok: false, retryable: true });
    expect(await createHttpSmsProvider(env, fakeFetch(400, 'bad number'))!.send(msg())).toMatchObject({ ok: false, retryable: false });
    const refuses = createHttpSmsProvider({ ...env, SMS_HTTP_OK_REGEX: '"status":"ok"' }, fakeFetch(200, '{"status":"error"}'))!;
    expect(await refuses.send(msg())).toMatchObject({ ok: false, retryable: false });
    const offline = createHttpSmsProvider(env, jest.fn(async () => { throw new Error('ECONNRESET'); }))!;
    expect(await offline.send(msg())).toMatchObject({ ok: false, retryable: true, error: 'Network: ECONNRESET' });
  });
});

describe('WhatsApp Cloud API provider', () => {
  const env = { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' };

  it('sends the approved template for the event and language', async () => {
    const calls: Call[] = [];
    const wa = createWhatsAppProvider(env, fakeFetch(200, '{"messages":[{"id":"wamid.1"}]}', calls))!;
    expect(await wa.send({ ...msg(), language: 'ur' })).toEqual({ ok: true, id: 'wamid.1' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(JSON.parse(calls[0].init!.body!)).toEqual({
      messaging_product: 'whatsapp',
      to: '923001234567',
      type: 'template',
      template: {
        name: 'mediq_token_issued',
        language: { code: 'ur' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }],
      },
    });
  });

  it('is off without credentials; retries rate limits only', async () => {
    expect(createWhatsAppProvider({ WHATSAPP_TOKEN: 't' }, fakeFetch(200, ''))).toBeNull();
    expect(await createWhatsAppProvider(env, fakeFetch(400, '{"error":{"code":130429,"message":"rate"}}'))!.send(msg())).toMatchObject({ ok: false, retryable: true });
    expect(await createWhatsAppProvider(env, fakeFetch(400, '{"error":{"code":132001,"message":"template missing"}}'))!.send(msg())).toMatchObject({
      ok: false,
      retryable: false,
      error: 'WhatsApp 400: template missing',
    });
  });
});

// ---------------------------------------------------------------------------
// Worker, against an in-memory version of the worker RPCs with the same
// charging rules as the database (charge on first begin only, refund on final
// failure, lock on claim).
// ---------------------------------------------------------------------------
type Row = ClaimedRow & { status: string; locked: boolean };

const fakeDb = (rows: Row[], credits = 10) => {
  const state = { credits, charges: 0, refunds: 0, finishThrows: 0 };
  const rpc: WorkerRpc = {
    async claim(limit) {
      const due = rows.filter(r => r.status === 'pending' || (r.status === 'sending' && !r.locked)).slice(0, limit);
      due.forEach(r => {
        r.status = 'sending';
        r.locked = true;
        r.attempts += 1;
      });
      return due.map(r => ({ ...r }));
    },
    async begin(id, channel, cost): Promise<BeginResult> {
      const row = rows.find(r => r.id === id)!;
      if (row.message_log_id) return { message_log_id: row.message_log_id, channel: row.channel!, charged: false };
      if (!row.modules.includes(channel) || state.credits < cost) {
        row.status = 'skipped';
        return { skipped: true, reason: 'Not enough message credits' };
      }
      state.credits -= cost;
      state.charges += 1;
      row.message_log_id = `log-${id}`;
      row.channel = channel;
      return { message_log_id: row.message_log_id, channel, charged: true };
    },
    async finish(id, ok, _providerId, _error, retryable) {
      if (state.finishThrows > 0) {
        state.finishThrows -= 1;
        throw new Error('network to database');
      }
      const row = rows.find(r => r.id === id)!;
      row.locked = false;
      if (ok) return (row.status = 'sent');
      if (retryable && row.attempts < row.max_attempts) return (row.status = 'pending');
      if (row.message_log_id) {
        state.credits += 1;
        state.refunds += 1;
      }
      return (row.status = 'failed');
    },
    async skip(id) {
      rows.find(r => r.id === id)!.status = 'skipped';
    },
  };
  return { rpc, state };
};

const row = (id: string, modules: string[] = ['queue', 'sms']): Row => ({
  id,
  organization_id: 'org',
  appointment_id: `appt-${id}`,
  event: 'token_issued',
  to_phone: '03001234567',
  language: 'ur',
  payload,
  attempts: 0,
  max_attempts: 3,
  channel: null,
  message_log_id: null,
  modules,
  status: 'pending',
  locked: false,
});

const provider = (channel: 'sms' | 'whatsapp', results: Array<Awaited<ReturnType<MessageProvider['send']>>>) => {
  const send = jest.fn(async () => results.shift() ?? { ok: true as const, id: 'x' });
  return { channel, send } as MessageProvider & { send: jest.Mock };
};

const run = (rpc: WorkerRpc, providers: Parameters<typeof runWorker>[0]['providers']) =>
  runWorker({ rpc, providers, costs: { sms: 1, whatsapp: 1 }, siteUrl: SITE, deadline: Date.now() + 5_000 });

describe('chooseChannel', () => {
  const sms = provider('sms', []);
  const wa = provider('whatsapp', []);
  it('takes the first channel the plan includes and the deployment can send', () => {
    expect(chooseChannel(['sms', 'whatsapp'], { sms, whatsapp: wa })).toBe('whatsapp');
    expect(chooseChannel(['sms', 'whatsapp'], { sms, whatsapp: wa }, ['sms', 'whatsapp'])).toBe('sms');
    expect(chooseChannel(['sms', 'whatsapp'], { sms })).toBe('sms');
    expect(chooseChannel(['queue'], { sms, whatsapp: wa })).toBeNull();
  });
});

describe('runWorker', () => {
  it('sends the rendered message and charges once per message', async () => {
    const { rpc, state } = fakeDb([row('1'), row('2')]);
    const sms = provider('sms', []);
    expect(await run(rpc, { sms })).toMatchObject({ claimed: 2, sent: 2, skipped: 0 });
    expect(state.charges).toBe(2);
    expect(sms.send.mock.calls[0][0]).toMatchObject({ to: '03001234567', event: 'token_issued', language: 'ur' });
    expect(sms.send.mock.calls[0][0].message.text).toContain('https://app.mediq.pk/t/ABCD2345');
  });

  it('skips without charging when the plan has no channel the deployment can send', async () => {
    const rows = [row('1', ['queue', 'qr_join'])];
    const { rpc, state } = fakeDb(rows);
    expect(await run(rpc, { sms: provider('sms', []) })).toMatchObject({ skipped: 1, sent: 0 });
    expect(rows[0].status).toBe('skipped');
    expect(state.charges).toBe(0);
  });

  it('retries a temporary failure on the next run without charging again', async () => {
    const rows = [row('1')];
    const { rpc, state } = fakeDb(rows);
    const sms = provider('sms', [{ ok: false, retryable: true, error: 'HTTP 503' }]);
    expect(await run(rpc, { sms })).toMatchObject({ retrying: 1 });
    expect(rows[0].status).toBe('pending');
    expect(await run(rpc, { sms })).toMatchObject({ sent: 1 });
    expect(state.charges).toBe(1);
    expect(sms.send).toHaveBeenCalledTimes(2);
  });

  it('refunds a message that finally fails', async () => {
    const rows = [row('1')];
    const { rpc, state } = fakeDb(rows, 5);
    const sms = provider('sms', [{ ok: false, retryable: false, error: 'invalid number' }]);
    expect(await run(rpc, { sms })).toMatchObject({ failed: 1 });
    expect(state).toMatchObject({ credits: 5, charges: 1, refunds: 1 });
  });

  it('does not send when there are no credits', async () => {
    const rows = [row('1')];
    const { rpc } = fakeDb(rows, 0);
    const sms = provider('sms', []);
    expect(await run(rpc, { sms })).toMatchObject({ skipped: 1 });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('a crash between send and finish never charges twice', async () => {
    const rows = [row('1')];
    const { rpc, state } = fakeDb(rows);
    state.finishThrows = 1;
    const sms = provider('sms', []);
    expect(await run(rpc, { sms })).toMatchObject({ errors: 1, sent: 0 });
    expect(rows[0].status).toBe('sending');
    rows[0].locked = false; // the lock expires
    expect(await run(rpc, { sms })).toMatchObject({ sent: 1 });
    expect(state.charges).toBe(1);
  });

  it('keeps the channel it was charged on', async () => {
    const rows = [{ ...row('1', ['sms', 'whatsapp']), channel: 'sms' as const, message_log_id: 'log-1' }];
    const { rpc, state } = fakeDb(rows);
    const sms = provider('sms', []);
    const whatsapp = provider('whatsapp', []);
    await run(rpc, { sms, whatsapp });
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(whatsapp.send).not.toHaveBeenCalled();
    expect(state.charges).toBe(0);
  });

  it('stops at the deadline and leaves the rest locked for the next run', async () => {
    const { rpc } = fakeDb([row('1'), row('2')]);
    let t = 0;
    const summary = await runWorker({
      rpc,
      providers: { sms: provider('sms', []) },
      costs: { sms: 1, whatsapp: 1 },
      siteUrl: SITE,
      deadline: 2,
      now: () => t++,
    });
    expect(summary).toMatchObject({ claimed: 2, sent: 1 });
  });
});
