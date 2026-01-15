-- Add missing columns to email_jobs table
ALTER TABLE email_jobs
ADD COLUMN IF NOT EXISTS processed_folders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_folders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS result_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS extracted_emails JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS email_count INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);
CREATE INDEX IF NOT EXISTS idx_email_jobs_account_id ON email_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_extracted_emails ON email_jobs USING GIN (extracted_emails);

-- Update any existing records to have default values for the new columns
UPDATE email_jobs 
SET 
    processed_folders = COALESCE(processed_folders, 0),
    total_folders = COALESCE(total_folders, 0),
    current_count = COALESCE(current_count, 0),
    total_count = COALESCE(total_count, 0),
    result_count = COALESCE(result_count, 0),
    extracted_emails = COALESCE(extracted_emails, '[]'::jsonb),
    email_count = COALESCE(email_count, 0);
