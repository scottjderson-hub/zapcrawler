const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database');
    
    // Read the migration file
    const migrationFile = path.join(__dirname, '../src/migrations/20240808040000_update_email_jobs_schema.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Running migration...');
    
    // Execute the SQL
    await client.query(sql);
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
