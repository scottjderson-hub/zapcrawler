-- Refresh Supabase schema cache to pick up new columns
-- This forces PostgREST to reload the schema information

-- Refresh the schema cache by notifying PostgREST
NOTIFY pgrst, 'reload schema';

-- Alternative approach: Update a system table to trigger schema reload
-- (This is a PostgREST-specific approach)
SELECT pg_notify('pgrst', 'reload schema');

-- Verify the columns exist in the sync_jobs table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sync_jobs' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
