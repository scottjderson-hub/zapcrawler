import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function checkSchema() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check if email_jobs table exists
    const { data: emailJobs, error: emailJobsError } = await supabase
      .from('email_jobs')
      .select('*')
      .limit(1);

    console.log('=== email_jobs table ===');
    if (emailJobsError) {
      console.error('Error checking email_jobs:', emailJobsError);
    } else {
      console.log('Columns in email_jobs:', Object.keys(emailJobs[0] || {}));
      console.log('Row count:', emailJobs?.length || 0);
    }

    // Check sync_jobs tables
    const checkTable = async (tableName: string) => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      console.log(`\n=== ${tableName} table ===`);
      if (error) {
        console.error(`Error checking ${tableName}:`, error);
      } else {
        console.log(`Columns in ${tableName}:`, data[0] ? Object.keys(data[0]) : 'No data');
        
        // Get row count
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
          
        console.log(`Row count:`, count || 0);
      }
    };

    await checkTable('sync_jobs');
    await checkTable('sync_jobs_camel');

    // Check if there are any foreign key relationships
    console.log('\n=== Checking for foreign key relationships ===');
    const { data: constraints, error: constraintsError } = await supabase
      .rpc('get_foreign_keys');

    if (constraintsError) {
      console.error('Error checking foreign keys:', constraintsError);
    } else {
      console.log('Foreign key relationships:', constraints || 'None found');
    }

  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

checkSchema();
