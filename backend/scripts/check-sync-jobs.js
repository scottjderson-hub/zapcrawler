const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkSyncJobs() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase URL or service role key in environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('Checking sync jobs in the database...');
    
    // Get all sync jobs
    const { data: syncJobs, error } = await supabase
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching sync jobs:', error);
      return;
    }

    console.log(`\nFound ${syncJobs.length} sync jobs (most recent first):`);
    syncJobs.forEach((job, index) => {
      console.log(`\nJob #${index + 1}:`);
      console.log(`  ID: ${job.id}`);
      console.log(`  Account ID: ${job.account_id}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Created: ${job.created_at}`);
      console.log(`  Completed: ${job.completed_at || 'Not completed'}`);
      if (job.error) {
        console.log(`  Error: ${job.error}`);
      }
    });

    // Get the most recent job details
    if (syncJobs.length > 0) {
      const latestJob = syncJobs[0];
      console.log('\nLatest job details:');
      console.log(JSON.stringify(latestJob, null, 2));
    }

  } catch (error) {
    console.error('Error checking sync jobs:', error);
  }
}

checkSyncJobs();
