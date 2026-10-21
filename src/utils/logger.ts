/* eslint-disable no-console -- the one place allowed to write to the console */
import { Sentry, sentryEnabled } from '../lib/sentry';

type LogArgs = unknown[];

// Production builds don't print debug output: many call sites log profiles,
// emails or payloads. Errors are still reported, but only their message and
// Error objects reach Sentry, never the extra arguments (where PII tends to sit).
const reportError = (args: LogArgs) => {
  if (!sentryEnabled) {
    return;
  }

  const error = args.find((arg): arg is Error => arg instanceof Error);
  const message = typeof args[0] === 'string' ? args[0] : undefined;

  if (error) {
    Sentry.captureException(error, message ? { extra: { message } } : undefined);
  } else if (message) {
    Sentry.captureMessage(message, 'error');
  }
};

export const logger = {
  log: (...args: LogArgs) => {
    if (__DEV__) {
      console.log(...args);
    }
  },
  warn: (...args: LogArgs) => {
    if (__DEV__) {
      console.warn(...args);
    }
  },
  error: (...args: LogArgs) => {
    if (__DEV__) {
      console.error(...args);
    }
    reportError(args);
  },
};
