/**
 * Turns whatever a failed call threw into something worth showing a patient.
 *
 * Screens pass `error.message` straight into `ErrorState` in a dozen places, so
 * a Postgres RLS violation or a `JWT expired` used to be rendered verbatim on a
 * clinic waiting-room screen. That is unhelpful to the person reading it and
 * leaks the shape of the backend.
 *
 * The rule is deliberately conservative: a message the app itself wrote ("This
 * slot is no longer available") is a *good* message and is passed through
 * untouched. Only text that looks like it came from a database, a transport
 * layer or an auth token is replaced. When in doubt, the generic fallback wins.
 *
 * This is presentation only. It never changes control flow, and it never
 * swallows the error — callers still get the original object.
 */

export const GENERIC_ERROR =
  'Something went wrong on our end. Please try again in a moment.';

type Rule = { test: RegExp; message: string };

/**
 * Ordered most specific first. Each maps a class of failure to copy that tells
 * the reader what happened and what they can do about it.
 */
const RULES: Rule[] = [
  {
    test: /network request failed|fetch failed|econnrefused|enotfound|network error|offline|failed to fetch/i,
    message: "We can't reach the server. Check your connection and try again.",
  },
  {
    test: /timeout|timed out|etimedout|aborted/i,
    message: 'That took too long to respond. Please try again.',
  },
  {
    test: /jwt|refresh[_ ]token|invalid token|token expired|not authenticated|auth session missing/i,
    message: 'Your session has expired. Please sign in again.',
  },
  {
    test: /row[- ]level security|rls|permission denied|insufficient_privilege|not authorized|unauthorized|forbidden|42501/i,
    message: "You don't have permission to view this.",
  },
  {
    test: /pgrst116|no rows returned|not found|404/i,
    message: "We couldn't find what you were looking for.",
  },
  {
    test: /duplicate key|already exists|unique constraint|23505|conflict/i,
    message: 'That already exists. Please review the details and try again.',
  },
  {
    test: /violates|constraint|relation ".*" does not exist|column .* does not exist|syntax error|sqlstate|postgres|pgrst/i,
    message: GENERIC_ERROR,
  },
  {
    test: /rate limit|too many requests|429/i,
    message: 'Too many attempts. Please wait a moment and try again.',
  },
  {
    test: /internal server error|500|502|503|504|service unavailable|bad gateway/i,
    message: 'The service is temporarily unavailable. Please try again shortly.',
  },
];

/** Signals that a string is machine output rather than something written for a person. */
const LOOKS_TECHNICAL =
  /[{}[\]<>]|::|\bat\s+\w+\.\w+|https?:\/\/|\b[A-Z]{3,}_[A-Z_]{3,}\b|^\w+error:|\bundefined\b|\bnull\b|\bNaN\b/i;

const extract = (input: unknown): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof Error) {
    return input.message;
  }
  if (input && typeof input === 'object') {
    const candidate = input as { message?: unknown; error_description?: unknown; details?: unknown };
    for (const value of [candidate.message, candidate.error_description, candidate.details]) {
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return '';
};

/**
 * @param input  Anything a `catch` produced: Error, string, Supabase error object.
 * @param fallback  Screen-specific copy, used when nothing better can be said.
 */
export const toUserMessage = (input: unknown, fallback: string = GENERIC_ERROR): string => {
  const raw = extract(input).trim();

  if (!raw) {
    return fallback;
  }

  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      return rule.message === GENERIC_ERROR ? fallback : rule.message;
    }
  }

  // Not a known failure class. Show it only if it reads like a sentence someone
  // wrote on purpose — short, prose-shaped, and free of machine punctuation.
  const isProse = raw.length <= 160 && !LOOKS_TECHNICAL.test(raw) && /^[A-Z]/.test(raw);

  return isProse ? raw : fallback;
};
