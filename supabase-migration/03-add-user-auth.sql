-- Migration to add user authentication and multi-tenancy support
-- Run this in Supabase SQL Editor to add user_id columns to all relevant tables

-- Add user_id columns to tables that don't have them
-- Note: proxies already has user_id as text, we need to change it to UUID
ALTER TABLE proxies DROP COLUMN IF EXISTS user_id;
ALTER TABLE proxies ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create indexes for user_id columns for better performance
CREATE INDEX IF NOT EXISTS idx_proxies_user_id ON proxies(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id ON email_jobs(user_id);

-- Remove the unique constraint on email to allow multiple users to have the same email address
-- First, drop the existing unique constraint
ALTER TABLE email_accounts DROP CONSTRAINT IF EXISTS email_accounts_email_key;

-- Add a unique constraint on email + user_id combination instead
ALTER TABLE email_accounts ADD CONSTRAINT email_accounts_email_user_id_key UNIQUE (email, user_id);

-- Remove unique constraint on proxy name to allow multiple users to have the same proxy name
ALTER TABLE proxies DROP CONSTRAINT IF EXISTS proxies_name_key;

-- Add a unique constraint on name + user_id combination instead
ALTER TABLE proxies ADD CONSTRAINT proxies_name_user_id_key UNIQUE (name, user_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies to ensure users can only access their own data

-- Proxies policies
CREATE POLICY "Users can view their own proxies" ON proxies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proxies" ON proxies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proxies" ON proxies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proxies" ON proxies
  FOR DELETE USING (auth.uid() = user_id);

-- Email accounts policies
CREATE POLICY "Users can view their own email accounts" ON email_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email accounts" ON email_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email accounts" ON email_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email accounts" ON email_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Email jobs policies (using email_jobs table name)
CREATE POLICY "Users can view their own email jobs" ON email_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email jobs" ON email_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email jobs" ON email_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email jobs" ON email_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Update trigger function to automatically set user_id for new records
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers to automatically set user_id on insert
CREATE TRIGGER set_user_id_proxies
  BEFORE INSERT ON proxies
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_user_id_email_accounts
  BEFORE INSERT ON email_accounts
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER set_user_id_email_jobs
  BEFORE INSERT ON email_jobs
  FOR EACH ROW EXECUTE FUNCTION set_user_id();