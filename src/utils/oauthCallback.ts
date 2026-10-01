import type { Session } from '@supabase/supabase-js';

export type OAuthCallbackParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorMessage: string | null;
};

export const parseOAuthCallback = (url: string): OAuthCallbackParams => {
  const params = new URLSearchParams();
  const [, queryString = ''] = url.split('?');
  const [queryWithoutHash = ''] = queryString.split('#');
  const [, fragmentString = ''] = url.split('#');

  [queryWithoutHash, fragmentString].forEach(part => {
    if (!part) return;

    new URLSearchParams(part).forEach((value, key) => {
      params.set(key, value);
    });
  });

  const oauthError = params.get('error_description') || params.get('error');

  return {
    code: params.get('code'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    errorMessage: oauthError ? decodeURIComponent(oauthError.replace(/\+/g, ' ')) : null,
  };
};

export const isGoogleSession = (session: Session | null): session is Session => {
  if (!session?.user) return false;

  const providers = session.user.app_metadata?.providers;

  return (
    session.user.app_metadata?.provider === 'google' ||
    (Array.isArray(providers) && providers.includes('google'))
  );
};
