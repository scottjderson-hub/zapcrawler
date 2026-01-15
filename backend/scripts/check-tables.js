const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkTables() {
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

    console.log('Checking Supabase tables...');
    
    // Check if email_jobs table exists and has data
    try {
      const { data: jobsData, count: jobsCount, error: jobsError } = await supabase
        .from('email_jobs')
        .select('*', { count: 'exact' });

      if (jobsError) throw jobsError;
      
      console.log(`email_jobs table exists with ${jobsCount || 0} rows`);
      
      if (jobsData && jobsData.length > 0) {
        console.log('First few jobs:', JSON.stringify(jobsData.slice(0, 3), null, 2));
      }
    } catch (error) {
      if (error.code === '42P01') {
        console.log('email_jobs table does not exist');
      } else {
        console.error('Error checking email_jobs table:', error);
      }
    }

    // Check if email_accounts table exists and has data
    try {
      const { data: accountsData, count: accountsCount, error: accountsError } = await supabase
        .from('email_accounts')
        .select('*', { count: 'exact' });

      if (accountsError) throw accountsError;
      
      console.log(`\nemail_accounts table exists with ${accountsCount || 0} rows`);
      
      if (accountsData && accountsData.length > 0) {
        console.log('First few accounts:', JSON.stringify(accountsData.slice(0, 3).map(a => ({
          id: a.id,
          email: a.email,
          provider: a.provider,
          status: a.status,
          proxy_id: a.proxy_id
        })), null, 2));
      }
    } catch (error) {
      if (error.code === '42P01') {
        console.log('email_accounts table does not exist');
      } else {
        console.error('Error checking email_accounts table:', error);
      }
    }

    // Check if extracted_emails table exists
    try {
      const { count: emailsCount, error: emailsError } = await supabase
        .from('extracted_emails')
        .select('*', { count: 'exact', head: true });

      if (emailsError) throw emailsError;
      
      console.log(`\nextracted_emails table exists with ${emailsCount || 0} rows`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log('extracted_emails table does not exist');
      } else {
        console.error('Error checking extracted_emails table:', error);
      }
    }

    // Check database schema
    try {
      console.log('\nChecking database schema...');
      const { data: tables, error: tablesError } = await supabase
        .from('pg_tables')
        .select('tablename')
        .ilike('schemaname', 'public');
      
      if (tablesError) throw tablesError;
      
      console.log('Tables in public schema:');
      console.log(tables.map(t => t.tablename).join(', '));
      
      // Check if migrations table exists
      const { data: migrations, error: migrationsError } = await supabase
        .from('migrations')
        .select('*');
      
      if (migrationsError) {
        console.log('\nNo migrations table found');
      } else {
        console.log('\nMigrations:', JSON.stringify(migrations, null, 2));
      }
    } catch (error) {
      console.error('Error checking database schema:', error);
    }

  } catch (error) {
    console.error('Error checking tables:', error);
  }
}

checkTables();
