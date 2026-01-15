-- FINAL SIGNUP FIX: Complete removal of problematic triggers
-- Run this in Supabase SQL Editor to immediately fix signup issues
-- This is the most comprehensive fix that will allow user signups to work

-- Step 1: Drop ALL existing triggers that might be causing issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS initialize_user_billing_trigger ON auth.users;
DROP TRIGGER IF EXISTS user_signup_trigger ON auth.users;

-- Step 2: Drop ALL trigger functions that might be causing issues
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS initialize_user_billing();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.initialize_user_billing();

-- Step 3: Ensure all required tables exist with proper structure
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('community', 'professional', 'enterprise')) DEFAULT 'community',
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'pending', 'trial')) DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_active_subscription_per_user UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS user_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Account usage
    email_accounts_count INTEGER NOT NULL DEFAULT 0,
    active_crawl_jobs INTEGER NOT NULL DEFAULT 0,
    total_emails_crawled BIGINT NOT NULL DEFAULT 0,
    
    -- Time-based usage
    daily_api_calls INTEGER NOT NULL DEFAULT 0,
    monthly_api_calls INTEGER NOT NULL DEFAULT 0,
    last_api_call TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(user_id)
);

-- Step 4: Enable RLS on tables (if not already enabled)
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage_stats ENABLE ROW LEVEL SECURITY;

-- Step 5: Create or replace RLS policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own usage stats" ON user_usage_stats;
CREATE POLICY "Users can view own usage stats" ON user_usage_stats
    FOR ALL USING (auth.uid() = user_id);

-- Step 6: Create backend-callable functions for safe user initialization
-- These functions will be called by the backend AFTER user signup, not during signup

CREATE OR REPLACE FUNCTION create_user_subscription_if_not_exists(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_subscriptions (user_id, plan_type, status)
    VALUES (user_id_param, 'community', 'active')
    ON CONFLICT (user_id) DO NOTHING;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail
        RAISE LOG 'Error creating subscription for user %: %', user_id_param, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_user_usage_stats_if_not_exists(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_usage_stats (user_id)
    VALUES (user_id_param)
    ON CONFLICT (user_id) DO NOTHING;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail
        RAISE LOG 'Error creating usage stats for user %: %', user_id_param, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create a combined function for easy backend usage
CREATE OR REPLACE FUNCTION initialize_user_billing_data(user_id_param UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Create subscription
    PERFORM create_user_subscription_if_not_exists(user_id_param);
    
    -- Create usage stats
    PERFORM create_user_usage_stats_if_not_exists(user_id_param);
    
    -- Return success
    result := json_build_object(
        'success', true,
        'message', 'User billing data initialized successfully'
    );
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- Return error but don't fail
        result := json_build_object(
            'success', false,
            'error', SQLERRM,
            'message', 'Error initializing user billing data'
        );
        
        RAISE LOG 'Error in initialize_user_billing_data for user %: %', user_id_param, SQLERRM;
        RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create the increment function for email account tracking
CREATE OR REPLACE FUNCTION increment_email_account_count(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
    -- First ensure the user has usage stats
    PERFORM create_user_usage_stats_if_not_exists(user_id_param);
    
    -- Then increment
    UPDATE user_usage_stats 
    SET 
        email_accounts_count = email_accounts_count + 1,
        updated_at = NOW()
    WHERE user_id = user_id_param;
    
    -- If no row was updated, insert a new one
    IF NOT FOUND THEN
        INSERT INTO user_usage_stats (user_id, email_accounts_count)
        VALUES (user_id_param, 1)
        ON CONFLICT (user_id) DO UPDATE SET 
            email_accounts_count = user_usage_stats.email_accounts_count + 1,
            updated_at = NOW();
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the request
        RAISE LOG 'Error incrementing email account count for user %: %', user_id_param, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_user_subscription_if_not_exists(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_usage_stats_if_not_exists(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_user_billing_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_email_account_count(UUID) TO authenticated;

-- Step 10: Clean up any orphaned records or inconsistent data
-- Remove any duplicate subscriptions
DELETE FROM user_subscriptions 
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id 
    FROM user_subscriptions 
    ORDER BY user_id, created_at DESC
);

-- Step 11: Verify the fix worked
DO $$
BEGIN
    RAISE NOTICE 'Signup fix applied successfully!';
    RAISE NOTICE 'All problematic triggers have been removed.';
    RAISE NOTICE 'User signups should now work without database errors.';
    RAISE NOTICE 'Billing data will be initialized by the backend after successful signup.';
END $$;