-- Token System Database Migration
-- Run this in Supabase SQL Editor

-- User token balances
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100,
  total_purchased INTEGER NOT NULL DEFAULT 100,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Token purchase history
CREATE TABLE IF NOT EXISTS token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id VARCHAR(50) NOT NULL,
  cubes_purchased INTEGER NOT NULL,
  price_usd DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  payment_id VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'pending',
  nowpayments_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Token consumption log
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  cubes_consumed INTEGER NOT NULL,
  sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_token_purchases_user_id ON token_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_payment_id ON token_purchases(payment_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_status ON token_purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_action_type ON token_transactions(action_type);
CREATE INDEX IF NOT EXISTS idx_token_transactions_sync_job_id ON token_transactions(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at);

-- Create trigger to update user_tokens.updated_at
CREATE OR REPLACE FUNCTION update_user_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_tokens_updated_at ON user_tokens;
CREATE TRIGGER trigger_update_user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_user_tokens_updated_at();

-- Function to safely deduct tokens with balance checking
CREATE OR REPLACE FUNCTION deduct_user_tokens(
  p_user_id UUID,
  p_action_type VARCHAR(50),
  p_cubes_consumed INTEGER,
  p_description TEXT DEFAULT NULL,
  p_sync_job_id UUID DEFAULT NULL,
  p_email_account_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO current_balance
  FROM user_tokens
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if user has enough tokens
  IF current_balance IS NULL OR current_balance < p_cubes_consumed THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct tokens
  UPDATE user_tokens
  SET 
    balance = balance - p_cubes_consumed,
    total_consumed = total_consumed + p_cubes_consumed,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the transaction
  INSERT INTO token_transactions (
    user_id,
    action_type,
    cubes_consumed,
    sync_job_id,
    email_account_id,
    description
  ) VALUES (
    p_user_id,
    p_action_type,
    p_cubes_consumed,
    p_sync_job_id,
    p_email_account_id,
    p_description
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to add tokens after purchase
CREATE OR REPLACE FUNCTION add_user_tokens(
  p_user_id UUID,
  p_cubes_to_add INTEGER,
  p_purchase_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Insert or update user tokens
  INSERT INTO user_tokens (user_id, balance, total_purchased)
  VALUES (p_user_id, p_cubes_to_add, p_cubes_to_add)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = user_tokens.balance + p_cubes_to_add,
    total_purchased = user_tokens.total_purchased + p_cubes_to_add,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get user token summary
CREATE OR REPLACE FUNCTION get_user_token_summary(p_user_id UUID)
RETURNS TABLE (
  balance INTEGER,
  total_purchased INTEGER,
  total_consumed INTEGER,
  recent_transactions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ut.balance,
    ut.total_purchased,
    ut.total_consumed,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', tt.id,
            'action_type', tt.action_type,
            'cubes_consumed', tt.cubes_consumed,
            'description', tt.description,
            'created_at', tt.created_at
          ) ORDER BY tt.created_at DESC
        )
        FROM token_transactions tt
        WHERE tt.user_id = p_user_id
        LIMIT 10
      ),
      '[]'::jsonb
    ) as recent_transactions
  FROM user_tokens ut
  WHERE ut.user_id = p_user_id;
  
  -- If no record exists, return defaults with 100 free cubes
  IF NOT FOUND THEN
    INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed)
    VALUES (p_user_id, 100, 100, 0);
    
    RETURN QUERY SELECT 100, 100, 0, '[]'::jsonb;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for token tables
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own token balance" ON user_tokens;
DROP POLICY IF EXISTS "Users can view their own token purchases" ON token_purchases;
DROP POLICY IF EXISTS "Users can view their own token transactions" ON token_transactions;
DROP POLICY IF EXISTS "Service role can manage user_tokens" ON user_tokens;
DROP POLICY IF EXISTS "Service role can manage token_purchases" ON token_purchases;
DROP POLICY IF EXISTS "Service role can manage token_transactions" ON token_transactions;

-- Users can only access their own token data
CREATE POLICY "Users can view their own token balance" ON user_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own token purchases" ON token_purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own token transactions" ON token_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all token data
CREATE POLICY "Service role can manage user_tokens" ON user_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage token_purchases" ON token_purchases
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage token_transactions" ON token_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- Initialize existing users with 100 free token balance
INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed)
SELECT id, 100, 100, 0 
FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM user_tokens)
ON CONFLICT (user_id) DO NOTHING;

-- Function to automatically give new users 100 free tokens
CREATE OR REPLACE FUNCTION handle_new_user_tokens()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed)
  VALUES (NEW.id, 100, 100, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created_tokens ON auth.users;
CREATE TRIGGER on_auth_user_created_tokens
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_tokens();