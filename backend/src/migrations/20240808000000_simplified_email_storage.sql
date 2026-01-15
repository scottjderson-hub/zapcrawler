-- Simplified email storage schema
-- This migration replaces the previous extracted_emails table with a simpler structure

BEGIN;

-- Drop old extracted_emails table if it exists
DROP TABLE IF EXISTS extracted_emails CASCADE;

-- Create email_jobs table
CREATE TABLE IF NOT EXISTS email_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create simplified extracted_emails table
CREATE TABLE IF NOT EXISTS extracted_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES email_jobs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  folder TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, email, folder)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_extracted_emails_email ON extracted_emails(email);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_job_id ON extracted_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_folder ON extracted_emails(folder);

COMMIT;
