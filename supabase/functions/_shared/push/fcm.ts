// FCM HTTP v1 for staff pushes: a service-account OAuth token (RS256 JWT,
// WebCrypto) and one message per device token. No Deno or npm imports, so
// Jest runs it on Node with a stand-in fetch.
//
// Secrets (project-wide, already used by send-queue-notification):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (PKCS8 PEM; "\n" escapes are fine)

export interface PushMessage {
  title: string;
  body: string;
  /** FCM data: string values only. */
  data: Record<string, string>;
  /** Notifications with the same tag replace each other on Android (and group on iOS). */
  tag?: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean; tokenGone: boolean };

export type PushSender = (token: string, message: PushMessage) => Promise<SendResult>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const base64url = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
};
const utf8 = (text: string) => new TextEncoder().encode(text);

export const pemToPkcs8 = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** The signed JWT Google's token endpoint exchanges for an access token. */
export const signServiceJwt = async (account: ServiceAccount, nowSeconds: number, subtle: SubtleCrypto): Promise<string> => {
  const header = base64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    utf8(
      JSON.stringify({
        iss: account.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    ),
  );
  const key = await subtle.importKey('pkcs8', pemToPkcs8(account.privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${header}.${claims}`)));
  return `${header}.${claims}.${base64url(signature)}`;
};

/** FCM v1 error -> what to do: retry later, or forget this device token. */
export const classifyFcmError = (status: number, body: unknown): { retryable: boolean; tokenGone: boolean; error: string } => {
  const error = (body as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null)?.error;
  const code = error?.details?.find(d => d?.errorCode)?.errorCode ?? error?.status ?? `HTTP ${status}`;
  const text = `${code}${error?.message ? `: ${error.message}` : ''}`.slice(0, 300);
  if (code === 'UNREGISTERED' || status === 404 || code === 'SENDER_ID_MISMATCH') return { retryable: false, tokenGone: true, error: text };
  if (status === 401 || status === 429 || status >= 500 || code === 'UNAVAILABLE' || code === 'INTERNAL' || code === 'QUOTA_EXCEEDED') {
    return { retryable: true, tokenGone: false, error: text };
  }
  return { retryable: false, tokenGone: false, error: text };
};

export const fcmBody = (token: string, message: PushMessage) => ({
  message: {
    token,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: { priority: 'HIGH', notification: { sound: 'default', ...(message.tag ? { tag: message.tag } : {}) } },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', ...(message.tag ? { 'thread-id': message.tag } : {}) } },
    },
  },
});

/** A sender for one worker run (the access token is fetched once and reused). */
export const createFcmSender = (
  account: ServiceAccount,
  fetchImpl: FetchLike,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
  now: () => number = Date.now,
): PushSender => {
  let accessToken: Promise<string> | null = null;
  const getAccessToken = () => {
    accessToken ??= (async () => {
      const assertion = await signServiceJwt(account, Math.floor(now() / 1000), subtle);
      const res = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
      if (!res.ok || !json.access_token) {
        accessToken = null;
        throw new Error(`FCM auth failed: ${json.error_description ?? json.error ?? res.status}`);
      }
      return json.access_token;
    })();
    return accessToken;
  };

  return async (token, message) => {
    let bearer: string;
    try {
      bearer = await getAccessToken();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), retryable: true, tokenGone: false };
    }
    try {
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(fcmBody(token, message)),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) return { ok: true, id: String((json as { name?: string } | null)?.name ?? '') };
      return { ok: false, ...classifyFcmError(res.status, json) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), retryable: true, tokenGone: false };
    }
  };
};

/** The service account from the environment, or null when push isn't configured. */
export const serviceAccountFromEnv = (env: Record<string, string | undefined>): ServiceAccount | null => {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY?.trim();
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
};
