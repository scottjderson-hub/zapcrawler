-- Row Level Security (RLS) for Mail Discovery Central
-- Run this in Supabase SQL Editor after creating tables

-- Enable RLS on all tables
ALTER TABLE proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_emails ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (you can add user-based policies later)
-- This is suitable for single-user or admin-managed systems

-- Proxies policies
CREATE POLICY "Allow all operations on proxies" ON proxies
  FOR ALL USING (true) WITH CHECK (true);

-- Email accounts policies
CREATE POLICY "Allow all operations on email_accounts" ON email_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Sync jobs policies
CREATE POLICY "Allow all operations on sync_jobs" ON sync_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- Extracted emails policies
CREATE POLICY "Allow all operations on extracted_emails" ON extracted_emails
  FOR ALL USING (true) WITH CHECK (true);

-- Optional: User-based policies (uncomment when you add authentication)
/*
-- Example user-based policies (requires auth.users table)
CREATE POLICY "Users can manage their own accounts" ON email_accounts
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can manage their own sync jobs" ON sync_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM email_accounts 
      WHERE email_accounts.id = sync_jobs.account_id 
      AND email_accounts.user_id = auth.uid()::text
    )
  );
*/
