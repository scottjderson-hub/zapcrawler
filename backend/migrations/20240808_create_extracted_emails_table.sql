-- Create extracted_emails table
CREATE TABLE IF NOT EXISTS public.extracted_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    account_id UUID NOT NULL,
    email TEXT NOT NULL,
    folder TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Add indexes for common queries
    CONSTRAINT fk_job FOREIGN KEY (job_id) REFERENCES public.email_jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_account FOREIGN KEY (account_id) REFERENCES public.email_accounts(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_extracted_emails_job_id ON public.extracted_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_account_id ON public.extracted_emails(account_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_email ON public.extracted_emails USING HASH (email);

-- Add a unique constraint to prevent duplicate emails in the same job
CREATE UNIQUE INDEX IF NOT EXISTS idx_extracted_emails_unique_email_per_job 
ON public.extracted_emails(job_id, email);

-- Update the updated_at column on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to update the updated_at column
DROP TRIGGER IF EXISTS update_extracted_emails_updated_at ON public.extracted_emails;
CREATE TRIGGER update_extracted_emails_updated_at
BEFORE UPDATE ON public.extracted_emails
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
