const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const TABLES_TO_CHECK = [
  'email_accounts',
  'extracted_emails',
  'proxies',
  'sync_jobs',
  'sync_jobs_camel',
  'batch_sync_progress',
  'email_jobs'
];

async function checkTables() {
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

  console.log('Checking specific tables...\n');
  
  for (const table of TABLES_TO_CHECK) {
    await checkTable(supabase, table);
  }
  
  console.log('\n=== Table Relationships ===');
  await checkRelationships(supabase);
}

async function checkTable(supabase, tableName) {
  try {
    console.log(`\n=== ${tableName} ===`);
    
    // Check if table exists by trying to get a single row
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Table does not exist');
      } else {
        console.log(`❌ Error (${error.code}): ${error.message}`);
      }
      return;
    }
    
    // Table exists, show columns and row count
    if (data && data.length > 0) {
      const sample = data[0];
      console.log('Columns:');
      for (const [key, value] of Object.entries(sample)) {
        console.log(`  - ${key}: ${JSON.stringify(value)} (${typeof value})`);
      }
      
      // Get row count
      const { count, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (!countError) {
        console.log(`\nTotal rows: ${count}`);
      }
    } else {
      console.log('Table exists but is empty');
    }
    
  } catch (error) {
    console.error(`Error checking table ${tableName}:`, error.message);
  }
}

async function checkRelationships(supabase) {
  // Check if email_jobs has a matching email_accounts
  try {
    const { data: jobs } = await supabase
      .from('email_jobs')
      .select('account_id')
      .limit(1);
    
    if (jobs && jobs.length > 0) {
      const accountId = jobs[0].account_id;
      console.log(`\nChecking email_jobs (account_id: ${accountId}) -> email_accounts`);
      
      const { data: account } = await supabase
        .from('email_accounts')
        .select('id')
        .eq('id', accountId)
        .maybeSingle();
      
      console.log(account ? '✅ Account exists' : '❌ Account not found');
    }
  } catch (error) {
    console.log('Could not verify email_jobs -> email_accounts relationship');
  }
  
  // Check extracted_emails job references
  try {
    const { data: emails } = await supabase
      .from('extracted_emails')
      .select('job_id')
      .limit(1);
    
    if (emails && emails.length > 0) {
      const jobId = emails[0].job_id;
      console.log(`\nChecking extracted_emails (job_id: ${jobId}) -> job tables`);
      
      const checkJobTable = async (table) => {
        const { data } = await supabase
          .from(table)
          .select('id')
          .eq('id', jobId)
          .maybeSingle();
        
        if (data) {
          console.log(`✅ Job found in ${table}`);
          return true;
        }
        return false;
      };
      
      // Check all possible job tables
      const jobTables = ['email_jobs', 'sync_jobs', 'sync_jobs_camel'];
      let found = false;
      
      for (const table of jobTables) {
        found = found || await checkJobTable(table);
      }
      
      if (!found) {
        console.log('❌ Job not found in any job table');
      }
    }
  } catch (error) {
    console.log('Could not verify extracted_emails job references');
  }
}

checkTables().catch(console.error);
