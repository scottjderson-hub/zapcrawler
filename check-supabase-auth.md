# Supabase Authentication Debug Guide

## 🔍 Steps to Debug Authentication Issues

### 1. Check Email Confirmation Settings in Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **Settings**
4. Check **Email Confirmation** settings:
   - If "Enable email confirmations" is ON, users must confirm their email before they can sign in
   - For testing, you can temporarily disable this

### 2. Check User Table in Supabase

1. Go to **Authentication** → **Users**
2. Check if users appear after signup
3. If users appear but are "unconfirmed", they need to confirm their email

### 3. Run Test Queries

Execute the queries in `test-auth.sql` in your SQL Editor to verify:
- Tables have `user_id` columns
- Row Level Security is enabled
- Policies are created correctly

### 4. Test Registration Process

1. Try registering with a real email you have access to
2. Check your email for confirmation link
3. Click the link to confirm
4. Then try logging in

### 5. Temporary Fix for Testing

If you want to skip email confirmation for testing:

```sql
-- Run this in Supabase SQL Editor to allow unconfirmed users to sign in
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;
```

## 🐛 Common Issues

1. **Email confirmation enabled** - Users must confirm email before they can access the app
2. **Migration not applied** - RLS policies not working because columns don't exist
3. **Frontend/Backend mismatch** - Backend using admin client instead of user-scoped client