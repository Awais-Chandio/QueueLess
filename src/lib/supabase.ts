import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const bundledSupabaseUrl = 'https://latdblyyakjrwzgxdean.supabase.co';
const bundledSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8';

const readProcessEnv = (key: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY') => {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }

  return process.env[key];
};

const normalizeConfigValue = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const supabaseUrl = normalizeConfigValue(readProcessEnv('SUPABASE_URL')) ?? bundledSupabaseUrl;
const supabaseAnonKey =
  normalizeConfigValue(readProcessEnv('SUPABASE_ANON_KEY')) ?? bundledSupabaseAnonKey;

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
