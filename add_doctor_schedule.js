const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  'https://latdblyyakjrwzgxdean.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdGRibHl5YWtqcnd6Z3hkZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzM1MjIsImV4cCI6MjA5MjQ0OTUyMn0.yFeA5OzkcuKdU5B4VVijI8tcqXjmYm3LORiq0DDn8C8'
);

async function run() {
  console.log("Signing in as Admin...");
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: 'admin@queueless.com',
    password: 'Admin@123456'
  });
  
  if (authError) {
    console.error('Sign in error:', authError);
    return;
  }
  console.log('Signed in successfully.');

  // Find doctors
  const { data: doctors, error: docErr } = await client
    .from('doctors')
    .select('id, name');
    
  if (docErr) {
    console.error('Error fetching doctors:', docErr);
    return;
  }

  for (const doc of doctors) {
    // Check if doctor has schedules
    const { data: schedules, error: schedErr } = await client
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doc.id);
      
    if (schedErr) {
      console.error(`Error fetching schedules for ${doc.name}:`, schedErr);
      continue;
    }

    console.log(`Doctor: ${doc.name} has ${schedules.length} schedules.`);
    
    if (schedules.length === 0) {
      console.log(`Adding default schedule for ${doc.name}...`);
      
      // Default schedules for Monday (1) to Saturday (6)
      const defaultSchedules = [];
      for (let day = 1; day <= 6; day++) {
        defaultSchedules.push({
          doctor_id: doc.id,
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '17:00:00',
          max_tokens_per_day: 40
        });
      }
      
      const { data: insertData, error: insertError } = await client
        .from('doctor_schedules')
        .insert(defaultSchedules)
        .select();
        
      if (insertError) {
        console.error(`Failed to insert schedules for ${doc.name}:`, insertError);
      } else {
        console.log(`Successfully added ${insertData.length} schedules for ${doc.name}.`);
      }
    }
  }

  console.log("Done.");
}

run();
