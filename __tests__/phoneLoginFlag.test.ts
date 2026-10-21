jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { signInWithPassword: jest.fn(), signUp: jest.fn() },
  },
}));

import { supabase } from '../src/lib/supabase';
import {
  PHONE_LOGIN_DISABLED_MESSAGE,
  PHONE_LOGIN_ENABLED,
} from '../src/config/featureFlags';
import { authService } from '../src/services/authService';

describe('phone login feature flag', () => {
  it('is off', () => {
    expect(PHONE_LOGIN_ENABLED).toBe(false);
  });

  it('stops the Firebase → Supabase bridge before it touches Supabase', async () => {
    await expect(
      authService.bridgeFirebaseUserToSupabase('firebase-uid', '+923001234567'),
    ).rejects.toThrow(PHONE_LOGIN_DISABLED_MESSAGE);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });
});
