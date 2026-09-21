const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  'https://latdblyyakjrwzgxdean.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8'
);

async function run() {
  console.log("Signing in as Admin...");
  const { data, error } = await client.auth.signInWithPassword({
    email: 'admin@queueless.com',
    password: 'Admin@123456'
  });
  
  if (error) {
    console.error('Sign in error:', error);
    return;
  }
  
  console.log('--- Admin User Info ---');
  console.log('ID:', data.user.id);
  console.log('Email:', data.user.email);
  console.log('Role (auth):', data.user.role);
  console.log('App Metadata:', data.user.app_metadata);
  console.log('User Metadata:', data.user.user_metadata);
  
  // Let's decode the JWT token to see the claims
  const token = data.session.access_token;
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('--- Decoded JWT Payload ---');
    console.log(payload);
  }
}

run();
