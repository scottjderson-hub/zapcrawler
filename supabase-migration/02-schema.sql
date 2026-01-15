-- Supabase Database Schema for Mail Discovery Central
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE account_status AS ENUM ('connected', 'disconnected', 'error', 'invalid', 'syncing');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_job_status') THEN
        CREATE TYPE sync_job_status AS ENUM ('pending', 'running', 'completed', 'failed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proxy_type') THEN
        CREATE TYPE proxy_type AS ENUM ('SOCKS5', 'HTTP');
    END IF;
END
$$;

-- 1. Proxies Table (migrate first - no dependencies)
CREATE TABLE IF NOT EXISTS proxies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  type proxy_type NOT NULL,
  user_id TEXT,
  password TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Email Accounts Table
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  auth JSONB NOT NULL, -- Store auth config as JSON
  status account_status NOT NULL DEFAULT 'disconnected',
  proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL,
  folders JSONB DEFAULT '[]'::jsonb, -- Store folders as JSON array
  last_sync TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Sync Jobs Table (most complex)
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  status sync_job_status NOT NULL DEFAULT 'pending',
  results_key TEXT,
  error TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Progress tracking
  result_count INTEGER DEFAULT 0,
  current_count INTEGER DEFAULT 0,
  processed_folders INTEGER DEFAULT 0,
  total_folders INTEGER DEFAULT 0,
  
  -- Batch sync support
  batch_sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
  parent_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
  child_job_ids UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- Batch progress as JSONB for flexibility
  batch_progress JSONB DEFAULT '{
    "completed": 0,
    "total": 0,
    "results": []
  }'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Extracted Emails Table (for storing extracted email addresses)
CREATE TABLE IF NOT EXISTS extracted_emails (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sync_job_id UUID NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  folder TEXT NOT NULL,  -- Source folder where email was found
  
  -- Derived data
  domain TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN position('@' in email) > 0 
      THEN substring(email from position('@' in email) + 1)
      ELSE NULL 
    END
  ) STORED,
  
  -- Metadata
  message_id TEXT,  -- Original message ID for reference
  message_date TIMESTAMP WITH TIME ZONE,  -- When the original message was sent
  
  -- System timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for faster lookups
  UNIQUE(sync_job_id, email, folder),  -- Prevent duplicate emails per sync job and folder
  CONSTRAINT chk_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Optimize common queries
CREATE INDEX IF NOT EXISTS idx_extracted_emails_email ON extracted_emails(email);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_account_id ON extracted_emails(account_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_sync_job_id ON extracted_emails(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_folder ON extracted_emails(folder);

-- Ensure all required columns exist in extracted_emails
DO $$
BEGIN
    -- Add message_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'extracted_emails' AND column_name = 'message_id') THEN
        ALTER TABLE extracted_emails ADD COLUMN message_id TEXT;
    END IF;
    
    -- Add message_date if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'extracted_emails' AND column_name = 'message_date') THEN
        ALTER TABLE extracted_emails ADD COLUMN message_date TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add created_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'extracted_emails' AND column_name = 'created_at') THEN
        ALTER TABLE extracted_emails ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Add updated_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'extracted_emails' AND column_name = 'updated_at') THEN
        ALTER TABLE extracted_emails ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Make folder required if it's not already
    IF EXISTS (SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'extracted_emails' AND column_name = 'folder' AND is_nullable = 'YES') THEN
        -- First, set any NULL folders to 'INBOX' as a default
        UPDATE extracted_emails SET folder = 'INBOX' WHERE folder IS NULL;
        -- Then alter the column to be NOT NULL
        ALTER TABLE extracted_emails ALTER COLUMN folder SET NOT NULL;
    END IF;
END
$$;

-- Create indexes for performance
CREATE INDEX idx_email_accounts_email ON email_accounts(email);
CREATE INDEX idx_email_accounts_status ON email_accounts(status);
CREATE INDEX idx_email_accounts_provider ON email_accounts(provider);

CREATE INDEX idx_sync_jobs_account_id ON sync_jobs(account_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_batch_sync_job_id ON sync_jobs(batch_sync_job_id);
CREATE INDEX idx_sync_jobs_parent_job_id ON sync_jobs(parent_job_id);
CREATE INDEX idx_sync_jobs_created_at ON sync_jobs(created_at DESC);

CREATE INDEX idx_extracted_emails_sync_job_id ON extracted_emails(sync_job_id);
CREATE INDEX idx_extracted_emails_account_id ON extracted_emails(account_id);
CREATE INDEX idx_extracted_emails_email ON extracted_emails(email);
CREATE INDEX idx_extracted_emails_domain ON extracted_emails(domain);
CREATE INDEX idx_extracted_emails_provider ON extracted_emails(provider);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_proxies_updated_at 
  BEFORE UPDATE ON proxies 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at 
  BEFORE UPDATE ON email_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_jobs_updated_at 
  BEFORE UPDATE ON sync_jobs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
