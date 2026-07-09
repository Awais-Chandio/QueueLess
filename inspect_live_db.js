const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  'https://latdblyyakjrwzgxdean.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8'
);

async function run() {
  const { data: authData, error } = await client.auth.signInWithPassword({
    email: 'admin@queueless.com',
    password: 'Admin@123456'
  });
  if (error) {
    console.error('Sign in error:', error);
    return;
  }
  console.log('Signed in as admin');

  // Query duplicates
  const { data: appts, error: err } = await client
    .from('appointments')
    .select('id, center_id, appointment_date, appointment_time, status')
    .not('status', 'in', '("cancelled","expired","no_show")');

  if (err) {
    console.error('Query error:', err);
    return;
  }

  // Find duplicates manually in JS
  const seen = new Map();
  const duplicates = [];
  for (const a of appts) {
    const key = `${a.center_id}|${a.appointment_date}|${a.appointment_time}`;
    if (seen.has(key)) {
      duplicates.push({ first: seen.get(key), second: a });
    } else {
      seen.set(key, a);
    }
  }

  console.log('Found duplicates count:', duplicates.length);
  console.log(JSON.stringify(duplicates, null, 2));
}
run();
