import * as Sentry from '@sentry/react-native';
import Config from 'react-native-config';

const dsn = Config.SENTRY_DSN?.trim();

// Off in development and when no DSN is configured (e.g. local builds), so
// crash reporting never depends on a developer's .env.
export const sentryEnabled = Boolean(dsn) && !__DEV__;

export const initSentry = () => {
  if (!sentryEnabled) {
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Health data app: no IPs, cookies or request bodies by default.
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
};

export { Sentry };
