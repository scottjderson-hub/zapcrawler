const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Known tables from our investigation
const KNOWN_TABLES = [
  'email_jobs',
  'sync_jobs',
  'extracted_emails',
  'proxies',
  'accounts',
  'migrations'
];

async function analyzeDatabase() {
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

  console.log('Starting database analysis...\n');
  
  // Test each known table
  for (const table of KNOWN_TABLES) {
    await analyzeTable(supabase, table);
  }
  
  // Check relationships between tables
  await checkRelationships(supabase);
}

async function analyzeTable(supabase, tableName) {
  console.log(`\n=== Analyzing Table: ${tableName} ===`);
  
  try {
    // Get table structure
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error) {
      console.log(`  ❌ Table does not exist or cannot be accessed: ${error.message}`);
      return;
    }
    
    if (data && data.length > 0) {
      const sample = data[0];
      console.log('\nColumns:');
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
      
      // For job tables, show status distribution
      if (tableName.endsWith('_jobs')) {
        await analyzeJobStatus(supabase, tableName);
      }
    } else {
      console.log('  Table is empty');
    }
    
  } catch (error) {
    console.error(`  Error analyzing table ${tableName}:`, error.message);
  }
}

async function analyzeJobStatus(supabase, tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('status, count')
      .group('status');
    
    if (!error && data) {
      console.log('\nStatus distribution:');
      data.forEach(row => {
        console.log(`  - ${row.status}: ${row.count}`);
      });
    }
  } catch (error) {
    console.log('  Could not get status distribution');
  }
}

async function checkRelationships(supabase) {
  console.log('\n=== Checking Table Relationships ===');
  
  // Check email_jobs -> accounts
  try {
    const { data, error } = await supabase
      .from('email_jobs')
      .select('account_id')
      .limit(1);
    
    if (!error && data && data.length > 0) {
      const accountId = data[0].account_id;
      console.log(`\nEmail jobs reference account_id: ${accountId}`);
      
      // Try to find matching account
      const { data: account, error: accError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .maybeSingle();
      
      if (account) {
        console.log('  ✓ Referenced account exists');
      } else if (accError) {
        console.log(`  ❌ Error checking account: ${accError.message}`);
      } else {
        console.log('  ❌ Referenced account does not exist');
      }
    }
  } catch (error) {
    console.log('  Could not verify email_jobs -> accounts relationship');
  }
  
  // Check extracted_emails -> sync_jobs
  try {
    const { data, error } = await supabase
      .from('extracted_emails')
      .select('job_id')
      .limit(1);
    
    if (!error && data && data.length > 0) {
      const jobId = data[0].job_id;
      console.log(`\nExtracted emails reference job_id: ${jobId}`);
      
      // Try to find matching job in both job tables
      const checkJobTable = async (table) => {
        const { data: job, error: jobError } = await supabase
          .from(table)
          .select('id')
          .eq('id', jobId)
          .maybeSingle();
        
        if (job) {
          console.log(`  ✓ Referenced job found in ${table}`);
          return true;
        }
        return false;
      };
      
      const foundInEmailJobs = await checkJobTable('email_jobs');
      const foundInSyncJobs = await checkJobTable('sync_jobs');
      
      if (!foundInEmailJobs && !foundInSyncJobs) {
        console.log('  ❌ Referenced job not found in any job table');
      }
    }
  } catch (error) {
    console.log('  Could not verify extracted_emails -> jobs relationship');
  }
}

analyzeDatabase().catch(console.error);
