-- Add extracted_emails and email_count columns to email_jobs table
ALTER TABLE email_jobs
ADD COLUMN IF NOT EXISTS extracted_emails JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS email_count INTEGER DEFAULT 0;

-- Create an index on the extracted_emails column for faster queries
CREATE INDEX IF NOT EXISTS idx_email_jobs_extracted_emails ON email_jobs USING GIN (extracted_emails);

-- Update the email_count for existing jobs based on extracted_emails table
-- This is optional and can be skipped if you don't need to migrate existing data
-- or if you're starting fresh
DO $$
BEGIN
    -- Only run this if the extracted_emails table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'extracted_emails') THEN
        -- Update email_count for jobs that have extracted emails
        UPDATE email_jobs
        SET 
            email_count = subquery.email_count,
            extracted_emails = subquery.emails
        FROM (
            SELECT 
                job_id,
                COUNT(DISTINCT email) as email_count,
                jsonb_agg(DISTINCT email) as emails
            FROM extracted_emails
            GROUP BY job_id
        ) as subquery
        WHERE email_jobs.id = subquery.job_id;
        
        -- Log how many jobs were updated
        RAISE NOTICE 'Updated % email_jobs with extracted emails', (SELECT COUNT(*) FROM email_jobs WHERE email_count > 0);
    END IF;
END $$;
