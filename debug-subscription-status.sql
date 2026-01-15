-- Debug query to check subscription status issues
-- Run this in Supabase SQL Editor to see what's happening

-- Check what data exists for users
SELECT 
    'auth.users' as table_name,
    u.id,
    u.email,
    u.created_at
FROM auth.users u
ORDER BY u.created_at DESC
LIMIT 5;

-- Check user_subscriptions data
SELECT 
    'user_subscriptions' as table_name,
    s.*
FROM user_subscriptions s
ORDER BY s.created_at DESC;

-- Check user_usage_stats data  
SELECT 
    'user_usage_stats' as table_name,
    us.*
FROM user_usage_stats us
ORDER BY us.created_at DESC;

-- Check plan_configurations data
SELECT 
    'plan_configurations' as table_name,
    pc.*
FROM plan_configurations pc
ORDER BY pc.sort_order;

-- Test the view with detailed join information
SELECT 
    u.id as user_id,
    u.email,
    s.id as subscription_id,
    s.plan_type as sub_plan_type,
    s.status as subscription_status,
    s.current_period_end,
    s.cancel_at_period_end,
    pc.id as plan_config_id,
    pc.name as plan_name,
    pc.max_email_accounts,
    pc.unmasked_emails,
    pc.priority_support,
    pc.advanced_exports,
    pc.api_access,
    us.id as usage_stats_id,
    us.email_accounts_count,
    CASE 
        WHEN pc.max_email_accounts IS NULL THEN FALSE
        ELSE us.email_accounts_count >= pc.max_email_accounts
    END as at_account_limit
FROM auth.users u
LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN plan_configurations pc ON s.plan_type = pc.plan_type
LEFT JOIN user_usage_stats us ON u.id = us.user_id
ORDER BY u.created_at DESC
LIMIT 10;

-- Test what happens if we assume community plan for users without subscriptions
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(s.plan_type, 'community') as effective_plan_type,
    COALESCE(s.status, 'active') as effective_status,
    COALESCE(s.current_period_end, NOW() + INTERVAL '1 year') as effective_period_end,
    COALESCE(s.cancel_at_period_end, FALSE) as effective_cancel_at_period_end,
    pc.name as plan_name,
    pc.max_email_accounts,
    pc.unmasked_emails,
    pc.priority_support,
    pc.advanced_exports,
    pc.api_access,
    us.email_accounts_count,
    CASE 
        WHEN pc.max_email_accounts IS NULL THEN FALSE
        ELSE COALESCE(us.email_accounts_count, 0) >= pc.max_email_accounts
    END as at_account_limit
FROM auth.users u
LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN plan_configurations pc ON COALESCE(s.plan_type, 'community') = pc.plan_type
LEFT JOIN user_usage_stats us ON u.id = us.user_id
ORDER BY u.created_at DESC
LIMIT 10;