-- Fix for signup trigger error
-- Run this in Supabase SQL Editor to fix the user signup issue

-- Ensure the user_usage_stats table exists (if not already created)
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

-- Enable RLS on user_usage_stats
ALTER TABLE user_usage_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for user_usage_stats
CREATE POLICY "Users can view own usage stats" ON user_usage_stats
    FOR ALL USING (auth.uid() = user_id);

-- Create or replace the trigger function for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert default usage stats for new user
    INSERT INTO user_usage_stats (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- If the function fails, log the error but don't block user creation
        RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create the increment function (used by email account creation)
CREATE OR REPLACE FUNCTION increment_email_account_count(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_usage_stats (user_id, email_accounts_count)
    VALUES (user_id_param, 1)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        email_accounts_count = user_usage_stats.email_accounts_count + 1,
        updated_at = NOW();
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the request
        RAISE LOG 'Error incrementing email account count: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;