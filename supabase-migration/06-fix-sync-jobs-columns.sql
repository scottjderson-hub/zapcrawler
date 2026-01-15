-- Fix sync_jobs table columns to match backend expectations
-- Add missing columns and create camelCase aliases for backend compatibility

-- Add missing columns
ALTER TABLE sync_jobs 
ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE sync_jobs 
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

ALTER TABLE sync_jobs 
ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 0;

ALTER TABLE sync_jobs 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Update any existing error data to error_message
UPDATE sync_jobs 
SET error_message = error 
WHERE error IS NOT NULL AND error_message IS NULL;

-- Create a view with camelCase column names for backend compatibility
CREATE OR REPLACE VIEW sync_jobs_camel AS
SELECT 
  id,
  name,
  account_id,
  status,
  results_key,
  error,
  error_message,
  started_at,
  completed_at AS "completedAt",
  result_count,
  current_count AS "currentCount",
  processed_folders,
  total_folders,
  progress,
  batch_sync_job_id,
  parent_job_id,
  child_job_ids,
  batch_progress,
  created_at,
  updated_at
FROM sync_jobs;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_completed_at ON sync_jobs(completed_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_progress ON sync_jobs(progress);

-- Add comments for documentation
COMMENT ON COLUMN sync_jobs.error_message IS 'Detailed error message for failed sync jobs';
COMMENT ON COLUMN sync_jobs.current_count IS 'Current number of processed messages';
COMMENT ON COLUMN sync_jobs.completed_at IS 'Timestamp when sync job completed';
COMMENT ON COLUMN sync_jobs.progress IS 'Sync progress percentage (0-100)';
COMMENT ON VIEW sync_jobs_camel IS 'View with camelCase column names for backend compatibility';
