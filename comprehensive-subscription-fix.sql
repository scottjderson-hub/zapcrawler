-- Comprehensive fix for subscription and billing issues
-- Run this in Supabase SQL Editor

-- 1. First, ensure all users have usage stats records
-- This function will create missing usage stats for existing users
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u 
        LEFT JOIN user_usage_stats us ON u.id = us.user_id 
        WHERE us.user_id IS NULL
    LOOP
        BEGIN
            INSERT INTO user_usage_stats (user_id, email_accounts_count, active_crawl_jobs, total_emails_crawled)
            VALUES (user_record.id, 0, 0, 0)
            ON CONFLICT (user_id) DO NOTHING;
            
            RAISE LOG 'Created usage stats for user: %', user_record.id;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE LOG 'Error creating usage stats for user %: %', user_record.id, SQLERRM;
        END;
    END LOOP;
END $$;

-- 2. Update the user_subscription_status view to handle community users properly
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
    COALESCE(us.total_emails_crawled, 0) as total_emails_crawled,
    COALESCE(us.active_crawl_jobs, 0) as active_crawl_jobs,
    -- Subscription ID (null for community users)
    s.id as subscription_id
FROM auth.users u
LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
-- Always join with plan_configurations, defaulting to community plan
LEFT JOIN plan_configurations pc ON COALESCE(s.plan_type, 'community') = pc.plan_type
LEFT JOIN user_usage_stats us ON u.id = us.user_id;

-- 3. Grant necessary permissions
GRANT SELECT ON user_subscription_status TO authenticated;

-- 4. Create/update function to get user subscription data for API
CREATE OR REPLACE FUNCTION get_user_subscription_data(user_id_param UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
    subscription_data RECORD;
    usage_data RECORD;
BEGIN
    -- Get subscription and usage data from the view
    SELECT * INTO subscription_data 
    FROM user_subscription_status 
    WHERE user_id = user_id_param;
    
    IF NOT FOUND THEN
        -- If user not found, return error
        result := json_build_object(
            'success', false,
            'error', 'User not found'
        );
        RETURN result;
    END IF;
    
    -- Build the response
    result := json_build_object(
        'success', true,
        'subscription', CASE 
            WHEN subscription_data.subscription_id IS NOT NULL THEN
                json_build_object(
                    'id', subscription_data.subscription_id,
                    'userId', subscription_data.user_id,
                    'planType', subscription_data.plan_type,
                    'status', subscription_data.subscription_status,
                    'currentPeriodEnd', subscription_data.current_period_end,
                    'cancelAtPeriodEnd', subscription_data.cancel_at_period_end,
                    'createdAt', subscription_data.subscription_created_at,
                    'updatedAt', subscription_data.subscription_created_at
                )
            ELSE NULL
        END,
        'usageStats', json_build_object(
            'emailAccountsCount', subscription_data.email_accounts_count,
            'totalEmailsCrawled', subscription_data.total_emails_crawled,
            'activeCrawlJobs', subscription_data.active_crawl_jobs
        ),
        'subscriptionStatus', json_build_object(
            'planType', subscription_data.plan_type,
            'planName', subscription_data.plan_name,
            'maxEmailAccounts', subscription_data.max_email_accounts,
            'unmaskedEmails', subscription_data.unmasked_emails,
            'prioritySupport', subscription_data.priority_support,
            'advancedExports', subscription_data.advanced_exports,
            'apiAccess', subscription_data.api_access,
            'emailAccountsCount', subscription_data.email_accounts_count,
            'atAccountLimit', subscription_data.at_account_limit
        )
    );
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'success', false,
            'error', SQLERRM
        );
        RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_subscription_data(UUID) TO authenticated;

-- 5. Test the function and view
-- This will show you the current state
SELECT 
    'View Test' as test_type,
    user_id,
    email,
    plan_type,
    plan_name,
    unmasked_emails,
    email_accounts_count,
    at_account_limit
FROM user_subscription_status 
ORDER BY user_id 
LIMIT 5;

-- 6. Show plan configurations to verify they exist
SELECT 
    'Plan Configurations' as test_type,
    plan_type,
    name,
    max_email_accounts,
    unmasked_emails
FROM plan_configurations 
ORDER BY sort_order;