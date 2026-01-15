const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// List of tables we're interested in
const TABLES_TO_ANALYZE = [
  'email_jobs',
  'sync_jobs',
  'extracted_emails',
  'accounts',
  'proxies'
];

async function analyzeTables() {
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

    console.log('Analyzing database schema...\n');
    
    // Check each table we're interested in
    for (const tableName of TABLES_TO_ANALYZE) {
      console.log(`\n=== Analyzing Table: ${tableName} ===`);
      
      try {
        // Get a single row to analyze structure
        const { data: sampleData, error: sampleError } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (sampleError) {
          console.log(`  Table does not exist or cannot be accessed`);
          continue;
        }
        
        if (sampleData && sampleData.length > 0) {
          // Show columns and sample data
          console.log('\nColumns and sample data:');
          const sample = sampleData[0];
          for (const [key, value] of Object.entries(sample)) {
            console.log(`  ${key}: ${JSON.stringify(value)} (${typeof value})`);
          }
          
          // Get row count
          const { count, error: countError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });
          
          if (!countError) {
            console.log(`\nTotal rows: ${count}`);
          }
          
          // For extracted_emails, analyze data distribution
          if (tableName === 'extracted_emails') {
            await analyzeExtractedEmails(supabase);
          }
          
          // For job tables, show status distribution
          if (tableName === 'email_jobs' || tableName === 'sync_jobs') {
            await analyzeJobTable(supabase, tableName);
          }
        }
      } catch (error) {
        console.error(`  Error analyzing table ${tableName}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error analyzing tables:', error);
  }
}

async function analyzeExtractedEmails(supabase) {
  console.log('\nAnalyzing extracted_emails table...');
  
  // Check for duplicates
  const { data: duplicates, error: dupError } = await supabase
    .from('extracted_emails')
    .select('email, count(*)')
    .group('email')
    .gt('count', 1);
  
  if (!dupError && duplicates && duplicates.length > 0) {
    console.log(`\nFound ${duplicates.length} email addresses with duplicates`);
    console.log('Sample duplicates:', duplicates.slice(0, 5));
  } else {
    console.log('No duplicate email addresses found');
  }
  
  // Check distribution by sync_job_id
  const { data: jobDistribution, error: jobDistError } = await supabase
    .from('extracted_emails')
    .select('sync_job_id, count(*)')
    .group('sync_job_id');
  
  if (!jobDistError && jobDistribution) {
    console.log('\nEmails per sync job:');
    jobDistribution.forEach(job => {
      console.log(`  Job ${job.sync_job_id}: ${job.count} emails`);
    });
  }
}

async function analyzeJobTable(supabase, tableName) {
  console.log(`\nAnalyzing ${tableName} table...`);
  
  // Get status distribution
  const { data: statusDist, error: statusError } = await supabase
    .from(tableName)
    .select('status, count(*)')
    .group('status');
  
  if (!statusError && statusDist) {
    console.log('\nStatus distribution:');
    statusDist.forEach(stat => {
      console.log(`  ${stat.status}: ${stat.count} jobs`);
    });
  }
  
  // Get most recent jobs
  const { data: recentJobs, error: recentError } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (!recentError && recentJobs) {
    console.log('\nMost recent jobs:');
    recentJobs.forEach(job => {
      console.log(`  ID: ${job.id}, Status: ${job.status}, Created: ${job.created_at}`);
      if (job.error) {
        console.log(`    Error: ${job.error}`);
      }
    });
  }
}

analyzeTables();
