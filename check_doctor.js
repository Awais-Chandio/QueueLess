const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  'https://latdblyyakjrwzgxdean.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8'
);

async function run() {
  console.log("Checking DB Connection...");
  
  // 1. Get current time on Postgres
  const { data: dbTime, error: dbTimeErr } = await client.rpc('get_db_time_debug'); // let's see if we can do raw query or standard functions
  
  // Alternatively, let's query doctors
  const { data: doctors, error: docErr } = await client
    .from('doctors')
    .select('id, name, is_on_break');
    
  if (docErr) {
    console.error('Error fetching doctors:', docErr);
    return;
  }
  
  console.log('--- Doctors in DB ---');
  console.log(doctors);

  // For each doctor, get schedules and leaves
  for (const doc of doctors) {
    console.log(`\n=== Doctor: ${doc.name} (ID: ${doc.id}) ===`);
    
    const { data: schedules, error: schedErr } = await client
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doc.id);
      
    if (schedErr) {
      console.error('Error fetching schedules:', schedErr);
    } else {
      console.log('Schedules:', schedules);
    }
    
    const { data: leaves, error: leaveErr } = await client
      .from('doctor_leaves')
      .select('*')
      .eq('doctor_id', doc.id);
      
    if (leaveErr) {
      console.error('Error fetching leaves:', leaveErr);
    } else {
      console.log('Leaves today/future:', leaves);
    }

    // Call RPC get_doctor_availability
    const { data: availability, error: availErr } = await client
      .rpc('get_doctor_availability', { p_doctor_id: doc.id });
      
    if (availErr) {
      console.error('Error calling get_doctor_availability:', availErr);
    } else {
      console.log('RPC Availability Result:', availability);
    }
  }

  // Also query current db date and time using a simple select via RPC if possible, or just print JS local time
  console.log('\n--- Environment Times ---');
  console.log('Local Node Time (ISO):', new Date().toISOString());
  console.log('Local Node Time (Locale):', new Date().toLocaleString());
}

run();
