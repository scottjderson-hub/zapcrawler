const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function listAllTables() {
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

    console.log('Querying database for tables...\n');
    
    // First, try to get all tables using information_schema
    console.log('=== Attempt 1: Using information_schema ===');
    try {
      const { data: tables, error } = await supabase.rpc('get_all_tables');
      if (!error && tables) {
        console.log('Tables found via RPC:');
        console.log(tables);
        return;
      }
    } catch (e) {
      console.log('RPC method failed, trying direct query...');
    }
    
    // Try direct query if RPC fails
    console.log('\n=== Attempt 2: Direct Query ===');
    try {
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (!error && data) {
        console.log('Tables found:');
        data.forEach(table => console.log(`- ${table.table_name}`));
      } else {
        console.error('Error querying information_schema:', error);
      }
    } catch (e) {
      console.error('Direct query failed:', e.message);
    }
    
    // Try listing tables by querying the tables we know about
    console.log('\n=== Attempt 3: Known Tables ===');
    const knownTables = [
      'email_jobs', 'sync_jobs', 'extracted_emails', 
      'accounts', 'proxies', 'migrations', 'schema_migrations'
    ];
    
    for (const table of knownTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
          
        if (!error) {
          console.log(`✓ Table exists: ${table}`);
          if (data && data.length > 0) {
            console.log('   Sample columns:', Object.keys(data[0]));
          }
        }
      } catch (e) {
        console.log(`✗ Table not found: ${table}`);
      }
    }
    
  } catch (error) {
    console.error('Error listing tables:', error);
  }
}

// Create the RPC function if it doesn't exist
async function createTableListRPC() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  try {
    const { data, error } = await supabase.rpc('get_all_tables');
    if (error) {
      console.log('Creating RPC function...');
      // This would need to be run in the Supabase SQL editor
      console.log(`
-- Run this in Supabase SQL Editor:
CREATE OR REPLACE FUNCTION get_all_tables()
RETURNS TABLE (table_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
      `);
    }
  } catch (e) {
    console.log('Could not create RPC function. Please run the SQL above in your Supabase SQL editor.');
  }
}

// First try to create the RPC function, then list tables
createTableListRPC().then(listAllTables);
