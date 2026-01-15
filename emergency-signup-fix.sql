-- Emergency fix: Temporarily disable the trigger to allow user signups
-- Run this in Supabase SQL Editor to immediately fix signup issues

-- Step 1: Drop the problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Drop the trigger function if it exists
DROP FUNCTION IF EXISTS handle_new_user();

-- Step 3: Ensure user_usage_stats table exists but is optional
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

-- Step 4: Enable RLS
ALTER TABLE user_usage_stats ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policy
DROP POLICY IF EXISTS "Users can view own usage stats" ON user_usage_stats;
CREATE POLICY "Users can view own usage stats" ON user_usage_stats
    FOR ALL USING (auth.uid() = user_id);

-- Step 6: Create a safe function for manual usage stats creation (called from backend)
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

-- Step 7: Create the increment function (used by email account creation)
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

-- Note: User signups should now work without any trigger interference.
-- Usage stats will be created on-demand when needed by the backend.