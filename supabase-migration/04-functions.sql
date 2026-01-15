-- Database Functions for Mail Discovery Central
-- Run this in Supabase SQL Editor

-- Function to get batch sync progress
CREATE OR REPLACE FUNCTION get_batch_sync_progress(batch_job_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'batchId', batch_job_id,
    'totalJobs', COUNT(*),
    'completedJobs', COUNT(*) FILTER (WHERE status = 'completed'),
    'failedJobs', COUNT(*) FILTER (WHERE status = 'failed'),
    'runningJobs', COUNT(*) FILTER (WHERE status = 'running'),
    'pendingJobs', COUNT(*) FILTER (WHERE status = 'pending'),
    'totalEmails', COALESCE(SUM(result_count), 0),
    'progress', CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('completed', 'failed'))::DECIMAL / COUNT(*)) * 100, 2)
    END
  ) INTO result
  FROM sync_jobs 
  WHERE parent_job_id = batch_job_id OR id = batch_job_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to update batch progress
CREATE OR REPLACE FUNCTION update_batch_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update parent job's batch_progress when child job status changes
  IF NEW.parent_job_id IS NOT NULL THEN
    UPDATE sync_jobs 
    SET batch_progress = (
      SELECT json_build_object(
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'total', COUNT(*),
        'results', json_agg(
          json_build_object(
            'jobId', id,
            'accountId', account_id,
            'status', status,
            'resultCount', result_count,
            'error', error
          )
        ) FILTER (WHERE status IN ('completed', 'failed'))
      )
      FROM sync_jobs 
      WHERE parent_job_id = NEW.parent_job_id
    )
    WHERE id = NEW.parent_job_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update batch progress
CREATE TRIGGER update_batch_progress_trigger
  AFTER UPDATE OF status ON sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_progress();

-- Function to get account sync statistics
CREATE OR REPLACE FUNCTION get_account_stats(account_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'accountId', account_uuid,
    'totalSyncs', COUNT(*),
    'successfulSyncs', COUNT(*) FILTER (WHERE status = 'completed'),
    'failedSyncs', COUNT(*) FILTER (WHERE status = 'failed'),
    'totalEmailsExtracted', COALESCE(SUM(result_count) FILTER (WHERE status = 'completed'), 0),
    'lastSync', MAX(started_at),
    'lastSuccessfulSync', MAX(completed_at) FILTER (WHERE status = 'completed')
  ) INTO result
  FROM sync_jobs 
  WHERE account_id = account_uuid;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old sync jobs (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_sync_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete sync jobs older than specified days and their extracted emails
  DELETE FROM extracted_emails 
  WHERE sync_job_id IN (
    SELECT id FROM sync_jobs 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_old
    AND status IN ('completed', 'failed')
  );
  
  DELETE FROM sync_jobs 
  WHERE created_at < NOW() - INTERVAL '1 day' * days_old
  AND status IN ('completed', 'failed');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get email provider statistics
CREATE OR REPLACE FUNCTION get_provider_stats()
RETURNS TABLE(provider TEXT, account_count BIGINT, total_emails BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ea.provider,
    COUNT(DISTINCT ea.id) as account_count,
    COALESCE(SUM(sj.result_count), 0) as total_emails
  FROM email_accounts ea
  LEFT JOIN sync_jobs sj ON ea.id = sj.account_id AND sj.status = 'completed'
  GROUP BY ea.provider
  ORDER BY total_emails DESC;
END;
$$ LANGUAGE plpgsql;
