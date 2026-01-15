-- Diagnostic and fix migration for RLS issues
-- This will ensure all necessary fields, policies, and triggers are in place

-- First, let's add the username field if it doesn't exist
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS username TEXT;

-- Check and ensure RLS is enabled on all tables
ALTER TABLE proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;

-- Recreate the trigger function to ensure it's correct
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate triggers to ensure they're working
DROP TRIGGER IF EXISTS set_user_id_proxies ON proxies;
DROP TRIGGER IF EXISTS set_user_id_email_accounts ON email_accounts;
DROP TRIGGER IF EXISTS set_user_id_email_jobs ON email_jobs;

CREATE TRIGGER set_user_id_proxies
  BEFORE INSERT ON proxies
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_user_id_email_accounts
  BEFORE INSERT ON email_accounts
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_user_id_email_jobs
  BEFORE INSERT ON email_jobs
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- Recreate RLS policies for proxies (drop existing first)
DROP POLICY IF EXISTS "Users can view their own proxies" ON proxies;
DROP POLICY IF EXISTS "Users can insert their own proxies" ON proxies;
DROP POLICY IF EXISTS "Users can update their own proxies" ON proxies;
DROP POLICY IF EXISTS "Users can delete their own proxies" ON proxies;

CREATE POLICY "Users can view their own proxies" ON proxies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proxies" ON proxies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proxies" ON proxies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proxies" ON proxies
  FOR DELETE USING (auth.uid() = user_id);

-- Recreate RLS policies for email_accounts (drop existing first)
DROP POLICY IF EXISTS "Users can view their own email accounts" ON email_accounts;
DROP POLICY IF EXISTS "Users can insert their own email accounts" ON email_accounts;
DROP POLICY IF EXISTS "Users can update their own email accounts" ON email_accounts;
DROP POLICY IF EXISTS "Users can delete their own email accounts" ON email_accounts;

CREATE POLICY "Users can view their own email accounts" ON email_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email accounts" ON email_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email accounts" ON email_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email accounts" ON email_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Recreate RLS policies for email_jobs (drop existing first)
DROP POLICY IF EXISTS "Users can view their own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can insert their own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can update their own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can delete their own email jobs" ON email_jobs;

CREATE POLICY "Users can view their own email jobs" ON email_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email jobs" ON email_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email jobs" ON email_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email jobs" ON email_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Clean up any existing proxies that don't have proper user_id set
-- This is OPTIONAL and will delete orphaned data - use with caution
-- UPDATE proxies SET user_id = NULL WHERE user_id IS NULL OR user_id = '';

-- For diagnostic purposes, let's create a view to check current data
CREATE OR REPLACE VIEW proxy_diagnostic AS
SELECT 
  id,
  name,
  host,
  port,
  type,
  user_id,
  username,
  created_at,
  -- Check if user_id is a valid UUID by casting to text first
  user_id::text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' as is_valid_uuid
FROM proxies;