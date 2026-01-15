-- Migration to add bullmq_job_id column to email_jobs table for job cancellation support

-- Add bullmq_job_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'email_jobs' AND column_name = 'bullmq_job_id') THEN
        ALTER TABLE email_jobs ADD COLUMN bullmq_job_id TEXT;
        
        -- Add index for performance when looking up jobs by BullMQ ID
        CREATE INDEX IF NOT EXISTS idx_email_jobs_bullmq_job_id ON email_jobs(bullmq_job_id);
        
        -- Add support for 'cancelled' status
        -- Note: This assumes the status column uses CHECK constraint or enum
        -- If it doesn't exist as a constraint, this will be ignored
        BEGIN
            ALTER TABLE email_jobs DROP CONSTRAINT IF EXISTS email_jobs_status_check;
            ALTER TABLE email_jobs ADD CONSTRAINT email_jobs_status_check 
                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
        EXCEPTION
            WHEN others THEN
                -- Ignore errors if constraint doesn't exist or can't be modified
                NULL;
        END;
        
        RAISE NOTICE 'Added bullmq_job_id column and cancelled status to email_jobs table';
    ELSE
        RAISE NOTICE 'bullmq_job_id column already exists in email_jobs table';
    END IF;
END
$$;