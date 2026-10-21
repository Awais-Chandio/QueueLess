// Loads the logger as a production build with a Sentry DSN configured.
const loadProductionLogger = () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  globals.__DEV__ = false;
  jest.doMock('react-native-config', () => ({ SENTRY_DSN: 'https://public@sentry.example/1' }));

  let loaded: { logger: typeof import('../src/utils/logger').logger; Sentry: any } | undefined;
  jest.isolateModules(() => {
    loaded = {
      logger: require('../src/utils/logger').logger,
      Sentry: require('@sentry/react-native'),
    };
  });
  return loaded!;
};

describe('logger in production', () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  const devFlag = globals.__DEV__;
  let consoleLog: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globals.__DEV__ = devFlag;
    jest.dontMock('react-native-config');
    jest.restoreAllMocks();
  });

  it('prints nothing for log, warn or error', () => {
    const { logger } = loadProductionLogger();

    logger.log('PROFILE:', { email: 'patient@example.com' });
    logger.warn('warn');
    logger.error('boom');

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('sends errors to Sentry without the extra (PII-prone) arguments', () => {
    const { logger, Sentry } = loadProductionLogger();
    const failure = new Error('insert failed');

    logger.error('[booking] failed for', { email: 'patient@example.com' }, failure);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      extra: { message: '[booking] failed for' },
    });
    expect(JSON.stringify(Sentry.captureException.mock.calls)).not.toContain('patient@example.com');
  });

  it('sends a plain message when there is no Error object', () => {
    const { logger, Sentry } = loadProductionLogger();

    logger.error('profile fetch failed', { phone: '+923001234567' });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('profile fetch failed', 'error');
    expect(JSON.stringify(Sentry.captureMessage.mock.calls)).not.toContain('+923001234567');
  });

  it('does not log debug output to Sentry', () => {
    const { logger, Sentry } = loadProductionLogger();

    logger.log('debug');
    logger.warn('warning');

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
