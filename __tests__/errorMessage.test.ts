import { toUserMessage, GENERIC_ERROR } from '../src/utils/errorMessage';

describe('toUserMessage', () => {
  it('keeps messages the app wrote for a person', () => {
    expect(toUserMessage('This slot is no longer available.')).toBe(
      'This slot is no longer available.',
    );
    expect(toUserMessage(new Error('Please enter a valid phone number'))).toBe(
      'Please enter a valid phone number',
    );
  });

  it('replaces database internals', () => {
    expect(toUserMessage('new row violates row-level security policy for table "appointments"'))
      .toBe("You don't have permission to view this.");
    expect(toUserMessage('duplicate key value violates unique constraint "appointments_pkey"'))
      .toBe('That already exists. Please review the details and try again.');
    expect(toUserMessage('relation "public.doctors" does not exist')).toBe(GENERIC_ERROR);
  });

  it('explains connectivity failures in terms the reader can act on', () => {
    expect(toUserMessage('Network request failed')).toBe(
      "We can't reach the server. Check your connection and try again.",
    );
    expect(toUserMessage(new Error('TypeError: fetch failed'))).toBe(
      "We can't reach the server. Check your connection and try again.",
    );
  });

  it('tells the user to sign in again when the token is the problem', () => {
    expect(toUserMessage('JWT expired')).toBe('Your session has expired. Please sign in again.');
    expect(toUserMessage({ message: 'Auth session missing!' })).toBe(
      'Your session has expired. Please sign in again.',
    );
  });

  it('reads Supabase-shaped error objects', () => {
    expect(toUserMessage({ error_description: 'Too many requests' })).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
    expect(toUserMessage({ details: 'PGRST116: no rows returned' })).toBe(
      "We couldn't find what you were looking for.",
    );
  });

  it('falls back rather than showing machine output', () => {
    expect(toUserMessage('at Object.<anonymous> (/src/index.js:1:1)')).toBe(GENERIC_ERROR);
    expect(toUserMessage('undefined is not an object')).toBe(GENERIC_ERROR);
    expect(toUserMessage('https://xyz.supabase.co/rest/v1/doctors returned 400')).toBe(
      GENERIC_ERROR,
    );
  });

  it('uses the screen-specific fallback when given one', () => {
    expect(toUserMessage(null, 'Unable to load your appointments.')).toBe(
      'Unable to load your appointments.',
    );
    expect(toUserMessage('', 'Unable to load your appointments.')).toBe(
      'Unable to load your appointments.',
    );
  });

  it('prefers the screen fallback over generic copy for opaque database errors', () => {
    expect(toUserMessage('syntax error at or near "SELECT"', 'Unable to load doctors.')).toBe(
      'Unable to load doctors.',
    );
  });
});
