-- Add username field for proxy authentication
-- This field will store the proxy's authentication username/userid
-- The existing user_id field is now used for the authenticated user's UUID

-- Add username field for proxy authentication credentials
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS username TEXT;

-- Update existing records that might have username stored in other ways
-- (This is safe to run multiple times)