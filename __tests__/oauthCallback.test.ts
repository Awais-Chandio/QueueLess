import { parseOAuthCallback } from '../src/utils/oauthCallback';

describe('parseOAuthCallback', () => {
  it('reads a PKCE code from the callback query', () => {
    expect(parseOAuthCallback('queueless://auth/callback?code=abc123')).toEqual({
      code: 'abc123',
      accessToken: null,
      refreshToken: null,
      errorMessage: null,
    });
  });

  it('reads tokens from an implicit callback fragment', () => {
    expect(
      parseOAuthCallback(
        'queueless://auth/callback#access_token=access&refresh_token=refresh',
      ),
    ).toEqual({
      code: null,
      accessToken: 'access',
      refreshToken: 'refresh',
      errorMessage: null,
    });
  });

  it('surfaces a cancelled Google authorization response', () => {
    expect(
      parseOAuthCallback(
        'queueless://auth/callback?error=access_denied&error_description=User+cancelled',
      ).errorMessage,
    ).toBe('User cancelled');
  });
});
