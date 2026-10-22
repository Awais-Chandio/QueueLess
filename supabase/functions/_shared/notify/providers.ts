// Message providers behind one interface. Each send reports whether a failure
// is worth retrying; the worker never charges twice either way (see
// begin_notification_send).

import type { Language, NotifyEvent, RenderedMessage } from './templates.ts';

export type Channel = 'sms' | 'whatsapp';

export interface OutgoingMessage {
  to: string;
  event: NotifyEvent;
  language: Language;
  message: RenderedMessage;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; retryable: boolean; error: string };

export interface MessageProvider {
  channel: Channel;
  send(message: OutgoingMessage): Promise<SendResult>;
}

export type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------
export type PhoneFormat = 'international' | 'e164' | 'local';

/**
 * Patients' numbers are stored as typed at the desk ("03001234567",
 * "+92 300 1234567", "923001234567"). Providers want them one way.
 */
export const formatPhone = (raw: string, format: PhoneFormat = 'international', countryCode = '92'): string => {
  const digits = raw.replace(/[^\d+]/g, '');
  let international: string;
  if (digits.startsWith('+')) international = digits.slice(1);
  else if (digits.startsWith('00')) international = digits.slice(2);
  else if (digits.startsWith('0')) international = countryCode + digits.slice(1);
  else if (digits.startsWith(countryCode)) international = digits;
  else international = countryCode + digits;

  if (format === 'e164') return `+${international}`;
  if (format === 'local') return international.startsWith(countryCode) ? `0${international.slice(countryCode.length)}` : international;
  return international;
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 15_000;

const classify = (status: number) => status === 429 || status >= 500;

const fetchWithTimeout = async (fetchImpl: FetchLike, url: string, init: Parameters<FetchLike>[1]) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const pick = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Generic HTTP SMS (most Pakistani SMS gateways are "POST these fields")
// ---------------------------------------------------------------------------
//   SMS_HTTP_URL            endpoint (required)
//   SMS_HTTP_METHOD         POST (default) | GET
//   SMS_HTTP_CONTENT_TYPE   application/json (default) | application/x-www-form-urlencoded
//   SMS_HTTP_BODY           body template; {{to}} {{text}} {{sender}} are filled in
//                           default: {"to":"{{to}}","message":"{{text}}","sender":"{{sender}}"}
//                           (for GET the same template becomes the query string)
//   SMS_HTTP_HEADERS        JSON object of extra headers, e.g. {"Authorization":"Bearer ..."}
//   SMS_SENDER              sender id / mask
//   SMS_PHONE_FORMAT        international (923001234567, default) | e164 | local
//   SMS_COUNTRY_CODE        92 (default)
//   SMS_HTTP_ID_FIELD       dot path to the message id in a JSON response, e.g. data.id
//   SMS_HTTP_OK_REGEX       the response body must match (gateways that answer 200 on errors)
export const DEFAULT_SMS_BODY = '{"to":"{{to}}","message":"{{text}}","sender":"{{sender}}"}';

export const createHttpSmsProvider = (env: Env, fetchImpl: FetchLike): MessageProvider | null => {
  const url = env.SMS_HTTP_URL;
  if (!url) return null;
  const method = (env.SMS_HTTP_METHOD || 'POST').toUpperCase();
  const contentType = env.SMS_HTTP_CONTENT_TYPE || 'application/json';
  const template = env.SMS_HTTP_BODY || DEFAULT_SMS_BODY;
  const headers: Record<string, string> = env.SMS_HTTP_HEADERS ? (parseJson(env.SMS_HTTP_HEADERS) as Record<string, string>) ?? {} : {};
  const okRegex = env.SMS_HTTP_OK_REGEX ? new RegExp(env.SMS_HTTP_OK_REGEX) : null;
  const format = (env.SMS_PHONE_FORMAT as PhoneFormat) || 'international';

  const fill = (to: string, text: string, encode: (v: string) => string) =>
    template
      .replace(/\{\{to\}\}/g, encode(to))
      .replace(/\{\{text\}\}/g, encode(text))
      .replace(/\{\{sender\}\}/g, encode(env.SMS_SENDER || ''));
  const jsonEscape = (v: string) => JSON.stringify(v).slice(1, -1);

  return {
    channel: 'sms',
    async send({ to, message }) {
      const phone = formatPhone(to, format, env.SMS_COUNTRY_CODE || '92');
      const form = contentType.includes('x-www-form-urlencoded') || method === 'GET';
      const body = fill(phone, message.text, form ? encodeURIComponent : jsonEscape);
      try {
        const res = await fetchWithTimeout(fetchImpl, method === 'GET' ? `${url}${url.includes('?') ? '&' : '?'}${body}` : url, {
          method,
          headers: method === 'GET' ? headers : { 'Content-Type': contentType, ...headers },
          body: method === 'GET' ? undefined : body,
        });
        const text = await res.text();
        if (!res.ok) return { ok: false, retryable: classify(res.status), error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        if (okRegex && !okRegex.test(text)) return { ok: false, retryable: false, error: `Gateway refused: ${text.slice(0, 200)}` };
        const id = env.SMS_HTTP_ID_FIELD ? pick(parseJson(text), env.SMS_HTTP_ID_FIELD) : null;
        return { ok: true, id: id == null ? null : String(id) };
      } catch (error) {
        return { ok: false, retryable: true, error: `Network: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
};

// ---------------------------------------------------------------------------
// WhatsApp Cloud API (Meta). Business-initiated messages must use approved
// templates: <prefix><event> in "ur" and "en", body params as in templates.ts.
// ---------------------------------------------------------------------------
//   WHATSAPP_TOKEN              permanent system-user token (required)
//   WHATSAPP_PHONE_NUMBER_ID    sender's phone number id (required)
//   WHATSAPP_API_VERSION        v21.0 (default)
//   WHATSAPP_TEMPLATE_PREFIX    mediq_ (default) -> mediq_token_issued, ...
//   WHATSAPP_COUNTRY_CODE       92 (default)
export const createWhatsAppProvider = (env: Env, fetchImpl: FetchLike): MessageProvider | null => {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION || 'v21.0'}/${phoneNumberId}/messages`;
  const prefix = env.WHATSAPP_TEMPLATE_PREFIX ?? 'mediq_';

  return {
    channel: 'whatsapp',
    async send({ to, event, language, message }) {
      const payload = {
        messaging_product: 'whatsapp',
        to: formatPhone(to, 'international', env.WHATSAPP_COUNTRY_CODE || '92'),
        type: 'template',
        template: {
          name: `${prefix}${event}`,
          language: { code: language },
          components: [{ type: 'body', parameters: message.params.map(text => ({ type: 'text', text })) }],
        },
      };
      try {
        const res = await fetchWithTimeout(fetchImpl, url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        const json = parseJson(text);
        if (!res.ok) {
          const error = pick(json, 'error.message') ?? text.slice(0, 200);
          // 130429: Meta rate limit; 131016: service unavailable.
          const code = Number(pick(json, 'error.code'));
          return { ok: false, retryable: classify(res.status) || code === 130429 || code === 131016, error: `WhatsApp ${res.status}: ${String(error)}` };
        }
        const id = pick(json, 'messages.0.id');
        return { ok: true, id: id == null ? null : String(id) };
      } catch (error) {
        return { ok: false, retryable: true, error: `Network: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
};

/** Providers configured in this environment, by channel. */
export const providersFromEnv = (env: Env, fetchImpl: FetchLike): Partial<Record<Channel, MessageProvider>> => {
  const providers: Partial<Record<Channel, MessageProvider>> = {};
  const sms = createHttpSmsProvider(env, fetchImpl);
  const whatsapp = createWhatsAppProvider(env, fetchImpl);
  if (sms) providers.sms = sms;
  if (whatsapp) providers.whatsapp = whatsapp;
  return providers;
};
