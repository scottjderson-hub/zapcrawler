const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function fixSchema() {
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

    console.log('Checking and updating email_jobs schema...');
    
    // Add missing columns if they don't exist
    const alterQueries = [
      `ALTER TABLE IF EXISTS email_jobs 
       ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS result_count INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS processed_folders INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS total_folders INTEGER DEFAULT 0;`,
      
      `COMMENT ON COLUMN email_jobs.current_count IS 'Number of items processed so far';`,
      `COMMENT ON COLUMN email_jobs.result_count IS 'Total number of results found';`,
      `COMMENT ON COLUMN email_jobs.processed_folders IS 'Number of folders processed so far';`,
      `COMMENT ON COLUMN email_jobs.total_folders IS 'Total number of folders to process';`
    ];

    // Execute each query
    for (const query of alterQueries) {
      console.log(`Executing: ${query.split('\n')[0].trim()}...`);
      const { data, error } = await supabase.rpc('pg_query', { query });
      
      if (error) {
        console.error('Error executing query:', error);
      } else {
        console.log('Query executed successfully');
      }
    }

    console.log('Schema update completed successfully');
    
  } catch (error) {
    console.error('Error updating schema:', error);
  }
}

fixSchema();
