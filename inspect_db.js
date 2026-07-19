const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  'https://latdblyyakjrwzgxdean.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8'
);

async function run() {
  const { data, error } = await client.auth.signInWithPassword({
    email: 'admin@queueless.com',
    password: 'Admin@123456'
  });
  if (error) {
    console.error('Sign in error:', error);
    return;
  }
  console.log('Signed in successfully');

  // Count profiles by role
  const { data: profiles, error: profError } = await client
    .from('profiles')
    .select('id, role, full_name, email');
  if (profError) {
    console.error('Failed to fetch profiles:', profError);
    return;
  }

  const roleCounts = {};
  profiles.forEach(p => {
    roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;
  });
  console.log('Profiles by role:', roleCounts);
  console.log('Profiles sample:', profiles.slice(0, 10));

  // Let's also check if there are appointments using the service_role key if we can find it,
  // but we don't have it. Let's see if we can check center_queue_settings or other tables.
  const { data: centers } = await client.from('service_centers').select('*');
  console.log('Centers:', centers);
}
run();
