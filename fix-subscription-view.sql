-- Fix for user_subscription_status view to handle community users properly
-- Run this in Supabase SQL Editor

-- Drop and recreate the view with better logic for community users
DROP VIEW IF EXISTS user_subscription_status;

CREATE VIEW user_subscription_status AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(s.plan_type, 'community') as plan_type,
    COALESCE(s.status, 'active') as subscription_status,
    COALESCE(s.current_period_end, NOW() + INTERVAL '365 days') as current_period_end,
    COALESCE(s.cancel_at_period_end, FALSE) as cancel_at_period_end,
    pc.name as plan_name,
    pc.max_email_accounts,
    pc.unmasked_emails,
    pc.priority_support,
    pc.advanced_exports,
    pc.api_access,
    COALESCE(us.email_accounts_count, 0) as email_accounts_count,
    CASE 
        WHEN pc.max_email_accounts IS NULL THEN FALSE
        ELSE COALESCE(us.email_accounts_count, 0) >= pc.max_email_accounts
    END as at_account_limit,
    -- Additional useful fields
    COALESCE(s.created_at, u.created_at) as subscription_created_at,
    us.total_emails_crawled,
    us.active_crawl_jobs
FROM auth.users u
LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
-- Always join with plan_configurations, defaulting to community plan
LEFT JOIN plan_configurations pc ON COALESCE(s.plan_type, 'community') = pc.plan_type
LEFT JOIN user_usage_stats us ON u.id = us.user_id;

-- Grant necessary permissions
GRANT SELECT ON user_subscription_status TO authenticated;

-- Test the view works correctly
SELECT * FROM user_subscription_status ORDER BY user_id DESC LIMIT 5;