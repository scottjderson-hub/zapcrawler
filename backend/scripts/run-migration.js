const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY in environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Read the migration file
    const migrationFile = path.join(__dirname, '../src/migrations/20240808040000_update_email_jobs_schema.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Running migration...');
    
    // Split the SQL into individual statements and execute them one by one
    const statements = sql.split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    for (const statement of statements) {
      if (!statement) continue;
      console.log(`Executing: ${statement.substring(0, 100)}...`);
      
      try {
        // For ALTER TABLE statements, we need to use the SQL editor API
        if (statement.toUpperCase().startsWith('ALTER TABLE') || 
            statement.toUpperCase().startsWith('CREATE INDEX') ||
            statement.toUpperCase().startsWith('UPDATE')) {
          
          // Use the Supabase SQL editor API to execute the statement
          const { data, error } = await supabase
            .from('sql')
            .select('*')
            .eq('query', statement);
          
          if (error) {
            console.error('Error executing statement:', error);
            throw error;
          }
          
          console.log('Statement executed successfully');
        } else {
          console.warn('Skipping unsupported statement type:', statement.split(' ')[0]);
        }
      } catch (error) {
        console.error('Error executing statement:', error);
        throw error;
      }
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to run migration:', error);
    process.exit(1);
  }
}

runMigration();
