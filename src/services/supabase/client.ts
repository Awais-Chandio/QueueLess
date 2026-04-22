import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://latdblyyakjrwzgxdean.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});