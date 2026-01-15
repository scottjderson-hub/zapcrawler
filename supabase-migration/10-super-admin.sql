-- Super Admin System Migration
-- Add super admin functionality to manage users and credits

-- Add is_super_admin column to user_tokens table
ALTER TABLE user_tokens
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Create index for super admin queries
CREATE INDEX IF NOT EXISTS idx_user_tokens_super_admin ON user_tokens(is_super_admin) WHERE is_super_admin = TRUE;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  SELECT is_super_admin INTO is_admin
  FROM user_tokens
  WHERE user_id = p_user_id;

  RETURN COALESCE(is_admin, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all users with their token balances (super admin only)
CREATE OR REPLACE FUNCTION get_all_users_with_tokens(p_admin_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  balance INTEGER,
  total_purchased INTEGER,
  total_consumed INTEGER,
  is_super_admin BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  last_login TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Check if requesting user is super admin
  IF NOT is_super_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    u.id as user_id,
    u.email::TEXT,
    COALESCE(ut.balance, 0) as balance,
    COALESCE(ut.total_purchased, 0) as total_purchased,
    COALESCE(ut.total_consumed, 0) as total_consumed,
    COALESCE(ut.is_super_admin, FALSE) as is_super_admin,
    u.created_at,
    u.last_sign_in_at as last_login
  FROM auth.users u
  LEFT JOIN user_tokens ut ON u.id = ut.user_id
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add credits to user account (super admin only)
CREATE OR REPLACE FUNCTION admin_add_user_tokens(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_cubes_to_add INTEGER,
  p_reason TEXT DEFAULT 'Admin credit adjustment'
)
RETURNS JSONB AS $$
DECLARE
  v_new_balance INTEGER;
  v_result JSONB;
BEGIN
  -- Check if requesting user is super admin
  IF NOT is_super_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can add tokens';
  END IF;

  -- Validate amount
  IF p_cubes_to_add <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Insert or update user tokens
  INSERT INTO user_tokens (user_id, balance, total_purchased)
  VALUES (p_target_user_id, p_cubes_to_add, p_cubes_to_add)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = user_tokens.balance + p_cubes_to_add,
    total_purchased = user_tokens.total_purchased + p_cubes_to_add,
    updated_at = NOW()
  RETURNING balance INTO v_new_balance;

  -- Log the admin action in token_transactions
  INSERT INTO token_transactions (
    user_id,
    action_type,
    cubes_consumed,
    description
  ) VALUES (
    p_target_user_id,
    'admin_credit_added',
    -p_cubes_to_add, -- Negative to indicate credit added
    format('Admin %s added credits: %s', p_admin_user_id, p_reason)
  );

  -- Create audit log entry
  INSERT INTO admin_audit_log (
    admin_user_id,
    action_type,
    target_user_id,
    details,
    created_at
  ) VALUES (
    p_admin_user_id,
    'ADD_CREDITS',
    p_target_user_id,
    jsonb_build_object(
      'cubes_added', p_cubes_to_add,
      'reason', p_reason,
      'new_balance', v_new_balance
    ),
    NOW()
  );

  v_result := jsonb_build_object(
    'success', TRUE,
    'new_balance', v_new_balance,
    'cubes_added', p_cubes_to_add
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct credits from user account (super admin only)
CREATE OR REPLACE FUNCTION admin_deduct_user_tokens(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_cubes_to_deduct INTEGER,
  p_reason TEXT DEFAULT 'Admin credit adjustment'
)
RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_result JSONB;
BEGIN
  -- Check if requesting user is super admin
  IF NOT is_super_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can deduct tokens';
  END IF;

  -- Validate amount
  IF p_cubes_to_deduct <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Get current balance with row lock
  SELECT balance INTO v_current_balance
  FROM user_tokens
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  -- Check if user has enough tokens
  IF v_current_balance IS NULL OR v_current_balance < p_cubes_to_deduct THEN
    RAISE EXCEPTION 'Insufficient balance: user has % tokens, trying to deduct %',
      COALESCE(v_current_balance, 0), p_cubes_to_deduct;
  END IF;

  -- Deduct tokens
  UPDATE user_tokens
  SET
    balance = balance - p_cubes_to_deduct,
    total_consumed = total_consumed + p_cubes_to_deduct,
    updated_at = NOW()
  WHERE user_id = p_target_user_id
  RETURNING balance INTO v_new_balance;

  -- Log the admin action
  INSERT INTO token_transactions (
    user_id,
    action_type,
    cubes_consumed,
    description
  ) VALUES (
    p_target_user_id,
    'admin_credit_deducted',
    p_cubes_to_deduct,
    format('Admin %s deducted credits: %s', p_admin_user_id, p_reason)
  );

  -- Create audit log entry
  INSERT INTO admin_audit_log (
    admin_user_id,
    action_type,
    target_user_id,
    details,
    created_at
  ) VALUES (
    p_admin_user_id,
    'DEDUCT_CREDITS',
    p_target_user_id,
    jsonb_build_object(
      'cubes_deducted', p_cubes_to_deduct,
      'reason', p_reason,
      'old_balance', v_current_balance,
      'new_balance', v_new_balance
    ),
    NOW()
  );

  v_result := jsonb_build_object(
    'success', TRUE,
    'new_balance', v_new_balance,
    'cubes_deducted', p_cubes_to_deduct
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL, -- ADD_CREDITS, DEDUCT_CREDITS, UPDATE_USER, etc.
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for admin_audit_log table
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_user_id ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at DESC);

-- Function to get admin audit logs
CREATE OR REPLACE FUNCTION get_admin_audit_logs(
  p_admin_user_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  admin_user_id UUID,
  admin_email TEXT,
  action_type VARCHAR(50),
  target_user_id UUID,
  target_email TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Check if requesting user is super admin
  IF NOT is_super_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can view audit logs';
  END IF;

  RETURN QUERY
  SELECT
    aal.id,
    aal.admin_user_id,
    au.email::TEXT as admin_email,
    aal.action_type,
    aal.target_user_id,
    tu.email::TEXT as target_email,
    aal.details,
    aal.created_at
  FROM admin_audit_log aal
  LEFT JOIN auth.users au ON aal.admin_user_id = au.id
  LEFT JOIN auth.users tu ON aal.target_user_id = tu.id
  ORDER BY aal.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics (super admin only)
CREATE OR REPLACE FUNCTION get_user_statistics(p_admin_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  -- Check if requesting user is super admin
  IF NOT is_super_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can view statistics';
  END IF;

  SELECT jsonb_build_object(
    'total_users', COUNT(*),
    'users_with_tokens', COUNT(*) FILTER (WHERE ut.balance > 0),
    'total_tokens_distributed', COALESCE(SUM(ut.total_purchased), 0),
    'total_tokens_consumed', COALESCE(SUM(ut.total_consumed), 0),
    'total_tokens_remaining', COALESCE(SUM(ut.balance), 0),
    'super_admins', COUNT(*) FILTER (WHERE ut.is_super_admin = TRUE)
  ) INTO v_stats
  FROM auth.users u
  LEFT JOIN user_tokens ut ON u.id = ut.user_id;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for admin_audit_log
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Super admins can view all audit logs
CREATE POLICY "Super admins can view audit logs" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_tokens
      WHERE user_id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- Service role can manage audit logs
CREATE POLICY "Service role can manage audit logs" ON admin_audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_users_with_tokens(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_user_tokens(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_deduct_user_tokens(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_audit_logs(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_statistics(UUID) TO authenticated;

-- Comment: To create a super admin, run:
-- UPDATE user_tokens SET is_super_admin = TRUE WHERE user_id = 'YOUR_USER_UUID';
-- or if the user doesn't have a token record yet:
-- INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed, is_super_admin)
-- VALUES ('YOUR_USER_UUID', 0, 0, 0, TRUE)
-- ON CONFLICT (user_id) DO UPDATE SET is_super_admin = TRUE;
