-- Add missing columns to email_jobs table
ALTER TABLE email_jobs 
  ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_folders INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_folders INTEGER DEFAULT 0;

-- Add comments for the new columns
COMMENT ON COLUMN email_jobs.current_count IS 'Number of items processed so far';
COMMENT ON COLUMN email_jobs.result_count IS 'Total number of results found';
COMMENT ON COLUMN email_jobs.processed_folders IS 'Number of folders processed so far';
COMMENT ON COLUMN email_jobs.total_folders IS 'Total number of folders to process';

-- Update existing sync jobs to set default values
UPDATE email_jobs 
SET 
  current_count = 0,
  result_count = 0,
  processed_folders = 0,
  total_folders = 0
WHERE 
  current_count IS NULL 
  OR result_count IS NULL 
  OR processed_folders IS NULL 
  OR total_folders IS NULL;
