-- Add new columns to email_jobs
ALTER TABLE email_jobs
ADD COLUMN IF NOT EXISTS extracted_emails JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS email_count INTEGER DEFAULT 0;

-- Migrate existing data if extracted_emails table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'extracted_emails') THEN
        -- Update email_jobs with data from extracted_emails
        UPDATE email_jobs
        SET 
            extracted_emails = subquery.emails,
            email_count = subquery.email_count
        FROM (
            SELECT 
                job_id,
                COALESCE(jsonb_agg(DISTINCT email), '[]'::jsonb) as emails,
                COUNT(DISTINCT email) as email_count
            FROM extracted_emails
            GROUP BY job_id
        ) as subquery
        WHERE email_jobs.id = subquery.job_id;
        
        -- Optional: Drop the old table after migration
        -- DROP TABLE IF EXISTS extracted_emails;
    END IF;
END $$;
