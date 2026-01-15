-- Enable Real-time Subscriptions for Mail Discovery Central
-- Run this in Supabase SQL Editor

-- Enable real-time for sync job progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE sync_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE email_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE extracted_emails;

-- Optional: Enable for proxies if you want real-time proxy updates
-- ALTER PUBLICATION supabase_realtime ADD TABLE proxies;

-- Create a view for real-time batch progress (optional)
CREATE OR REPLACE VIEW batch_sync_progress AS
SELECT 
  parent.id as batch_id,
  parent.name as batch_name,
  parent.status as batch_status,
  parent.started_at as batch_started_at,
  COUNT(children.id) as total_jobs,
  COUNT(children.id) FILTER (WHERE children.status = 'completed') as completed_jobs,
  COUNT(children.id) FILTER (WHERE children.status = 'failed') as failed_jobs,
  COUNT(children.id) FILTER (WHERE children.status = 'running') as running_jobs,
  COUNT(children.id) FILTER (WHERE children.status = 'pending') as pending_jobs,
  COALESCE(SUM(children.result_count), 0) as total_emails,
  CASE 
    WHEN COUNT(children.id) = 0 THEN 0
    ELSE ROUND((COUNT(children.id) FILTER (WHERE children.status IN ('completed', 'failed'))::DECIMAL / COUNT(children.id)) * 100, 2)
  END as progress_percentage
FROM sync_jobs parent
LEFT JOIN sync_jobs children ON children.parent_job_id = parent.id
WHERE parent.parent_job_id IS NULL -- Only parent jobs
GROUP BY parent.id, parent.name, parent.status, parent.started_at;

-- Enable real-time on the view (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE batch_sync_progress;
