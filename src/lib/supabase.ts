import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

// Values come from .env via react-native-config and are compiled into the app
// binary, so they are public. SUPABASE_ANON_KEY must only ever be the anon /
// publishable key. Never put the service_role (or sb_secret_) key in the app:
// it bypasses RLS and anyone who unpacks the APK/IPA could read it.
const normalizeConfigValue = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const supabaseUrl = normalizeConfigValue(Config.SUPABASE_URL);
const supabaseAnonKey = normalizeConfigValue(Config.SUPABASE_ANON_KEY);

const missingConfig = [
  supabaseUrl ? null : 'SUPABASE_URL',
  supabaseAnonKey ? null : 'SUPABASE_ANON_KEY',
].filter((key): key is string => Boolean(key));

export const supabaseConfig = {
  isValid: missingConfig.length === 0,
  missingKeys: missingConfig,
  errorMessage:
    missingConfig.length > 0
      ? `Missing Supabase configuration: ${missingConfig.join(', ')}.`
      : null,
};

const clientSupabaseUrl = supabaseUrl ?? 'https://missing-supabase-url.supabase.co';
const clientSupabaseAnonKey = supabaseAnonKey ?? 'missing-supabase-anon-key';

export const supabase = createClient(clientSupabaseUrl, clientSupabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
