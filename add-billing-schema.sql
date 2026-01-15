-- Billing System Database Schema
-- Add subscription management tables for the three-tier system

-- User subscriptions table
CREATE TABLE user_subscriptions (
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
    
    -- Ensure only one active subscription per user
    CONSTRAINT unique_active_subscription_per_user UNIQUE (user_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Payment transactions table for crypto payments via nowpayments.io
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    
    -- NOWPayments.io specific fields
    nowpayments_payment_id TEXT UNIQUE, -- NOWPayments payment ID
    payment_status TEXT NOT NULL CHECK (payment_status IN ('waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired')) DEFAULT 'waiting',
    
    -- Payment details
    price_amount DECIMAL(20,8) NOT NULL, -- USD amount
    pay_amount DECIMAL(20,8), -- Crypto amount to pay
    pay_currency TEXT NOT NULL, -- BTC, ETH, LTC, etc.
    pay_address TEXT, -- Crypto address to send payment to
    
    -- Order details
    order_id TEXT NOT NULL UNIQUE, -- Our internal order ID
    order_description TEXT,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('professional', 'enterprise')),
    billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')) DEFAULT 'monthly',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Payment expiration time
    confirmed_at TIMESTAMPTZ, -- When payment was confirmed
    
    -- Webhook data
    callback_url TEXT,
    ipn_callback_url TEXT,
    success_url TEXT,
    cancel_url TEXT
);

-- Plan configurations table
CREATE TABLE plan_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_type TEXT NOT NULL UNIQUE CHECK (plan_type IN ('community', 'professional', 'enterprise')),
    
    -- Plan details
    name TEXT NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Feature limits
    max_email_accounts INTEGER, -- NULL means unlimited
    unmasked_emails BOOLEAN NOT NULL DEFAULT FALSE,
    priority_support BOOLEAN NOT NULL DEFAULT FALSE,
    advanced_exports BOOLEAN NOT NULL DEFAULT FALSE,
    api_access BOOLEAN NOT NULL DEFAULT FALSE,
    white_label BOOLEAN NOT NULL DEFAULT FALSE,
    custom_integrations BOOLEAN NOT NULL DEFAULT FALSE,
    dedicated_support BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default plan configurations
INSERT INTO plan_configurations (plan_type, name, description, price_monthly, price_yearly, max_email_accounts, unmasked_emails, priority_support, advanced_exports, api_access, white_label, custom_integrations, dedicated_support, sort_order) VALUES
('community', 'Community', 'Perfect for trying out ZapCrawler', 0.00, 0.00, 3, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 1),
('professional', 'Professional', 'For small teams and professionals', 29.00, 290.00, 10, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, 2),
('enterprise', 'Enterprise', 'For large organizations with unlimited needs', 99.00, 990.00, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3);

-- Usage tracking table for monitoring account limits
CREATE TABLE user_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Account usage
    email_accounts_count INTEGER NOT NULL DEFAULT 0,
    active_crawl_jobs INTEGER NOT NULL DEFAULT 0,
    total_emails_crawled BIGINT NOT NULL DEFAULT 0,
    
    -- Time-based usage (for potential future rate limiting)
    daily_api_calls INTEGER NOT NULL DEFAULT 0,
    monthly_api_calls INTEGER NOT NULL DEFAULT 0,
    last_api_call TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per user
    CONSTRAINT unique_user_usage UNIQUE (user_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_plan_type ON user_subscriptions(plan_type);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_nowpayments_id ON payment_transactions(nowpayments_payment_id);
CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(payment_status);
CREATE INDEX idx_user_usage_stats_user_id ON user_usage_stats(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for automatic updated_at updates
CREATE TRIGGER update_user_subscriptions_updated_at 
    BEFORE UPDATE ON user_subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at 
    BEFORE UPDATE ON payment_transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plan_configurations_updated_at 
    BEFORE UPDATE ON plan_configurations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_usage_stats_updated_at 
    BEFORE UPDATE ON user_usage_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) policies for multi-tenant security
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage_stats ENABLE ROW LEVEL SECURITY;

-- Users can only see their own subscription data
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" ON user_subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can only see their own payment transactions
CREATE POLICY "Users can view own payments" ON payment_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own usage stats
CREATE POLICY "Users can view own usage" ON user_usage_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON user_usage_stats
    FOR UPDATE USING (auth.uid() = user_id);

-- Plan configurations are readable by all authenticated users
CREATE POLICY "Authenticated users can view plans" ON plan_configurations
    FOR SELECT USING (auth.role() = 'authenticated');

-- Function to initialize user subscription and usage stats on user creation
CREATE OR REPLACE FUNCTION initialize_user_billing()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default community subscription
    INSERT INTO user_subscriptions (user_id, plan_type, status)
    VALUES (NEW.id, 'community', 'active');
    
    -- Initialize usage stats
    INSERT INTO user_usage_stats (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-initialize billing for new users
CREATE TRIGGER initialize_user_billing_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION initialize_user_billing();

-- Function to update email account count in usage stats
CREATE OR REPLACE FUNCTION update_email_account_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update email accounts count when email_accounts table changes
    UPDATE user_usage_stats 
    SET email_accounts_count = (
        SELECT COUNT(*) 
        FROM email_accounts 
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    ),
    updated_at = NOW()
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Trigger to auto-update email account count
-- Note: This assumes email_accounts table exists with user_id column
CREATE TRIGGER update_email_account_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON email_accounts
    FOR EACH ROW EXECUTE FUNCTION update_email_account_count();

-- View for easy subscription status checking
CREATE VIEW user_subscription_status AS
SELECT 
    u.id as user_id,
    u.email,
    s.plan_type,
    s.status as subscription_status,
    s.current_period_end,
    s.cancel_at_period_end,
    pc.name as plan_name,
    pc.max_email_accounts,
    pc.unmasked_emails,
    pc.priority_support,
    pc.advanced_exports,
    pc.api_access,
    us.email_accounts_count,
    CASE 
        WHEN pc.max_email_accounts IS NULL THEN FALSE
        ELSE us.email_accounts_count >= pc.max_email_accounts
    END as at_account_limit
FROM auth.users u
LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN plan_configurations pc ON s.plan_type = pc.plan_type
LEFT JOIN user_usage_stats us ON u.id = us.user_id;

-- Grant necessary permissions
GRANT SELECT ON user_subscription_status TO authenticated;
GRANT SELECT ON plan_configurations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payment_transactions TO authenticated;
GRANT SELECT, UPDATE ON user_usage_stats TO authenticated;