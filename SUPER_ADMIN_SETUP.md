# Super Admin Dashboard Setup Guide

This guide explains how to set up and use the Super Admin Dashboard feature for managing users and credits.

## Features

The Super Admin Dashboard provides:

- **User Management**: View all registered users with their email, token balance, and activity
- **Credit Management**: Add or deduct credits (cubes) from user accounts
- **Statistics Dashboard**: Overview of total users, token distribution, and consumption
- **Audit Logs**: Complete history of all administrative actions
- **Search & Filter**: Find users quickly by email or user ID

## Setup Instructions

### 1. Run Database Migration

First, apply the super admin database migration to your Supabase database:

```bash
# Navigate to the Supabase SQL Editor and run:
```

Execute the SQL file located at: `supabase-migration/10-super-admin.sql`

This will create:
- `is_super_admin` column in the `user_tokens` table
- `admin_audit_log` table for tracking administrative actions
- Database functions for super admin operations
- Row Level Security (RLS) policies

### 2. Create Your First Super Admin

After running the migration, you need to designate at least one user as a super admin.

**Option A: Using Supabase SQL Editor**

```sql
-- Replace 'YOUR_USER_UUID' with your actual Supabase user ID
INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed, is_super_admin)
VALUES ('YOUR_USER_UUID', 0, 0, 0, TRUE)
ON CONFLICT (user_id)
DO UPDATE SET is_super_admin = TRUE;
```

**Option B: If user already has token record**

```sql
UPDATE user_tokens
SET is_super_admin = TRUE
WHERE user_id = 'YOUR_USER_UUID';
```

### 3. Find Your User ID

To find your Supabase user ID:

1. Log into your application
2. Open browser Developer Tools (F12)
3. Go to Console tab
4. Run: `localStorage.getItem('sb-your-project-auth-token')`
5. Decode the JWT token to get the user ID, or:
6. Go to Supabase Dashboard → Authentication → Users → Copy your user ID

### 4. Restart Backend (if running)

```bash
cd backend
npm run dev
```

### 5. Access the Super Admin Dashboard

Once you're designated as a super admin:

1. Log into your application
2. Navigate to `/admin` or click "Super Admin" in the sidebar
3. You should see the Super Admin Dashboard with user listings and statistics

## Using the Super Admin Dashboard

### Dashboard Overview

The dashboard shows key statistics:
- **Total Users**: All registered users
- **Tokens Distributed**: Total credits purchased by all users
- **Tokens Consumed**: Total credits used across the platform
- **Super Admins**: Number of admin users

### Managing User Credits

**To Add Credits:**
1. Find the user in the user list
2. Click the "+" button in the Actions column
3. Enter the amount of cubes to add
4. Optionally provide a reason
5. Click "Add Credits"

**To Deduct Credits:**
1. Find the user in the user list
2. Click the "-" button in the Actions column
3. Enter the amount of cubes to deduct
4. Optionally provide a reason
5. Click "Deduct Credits"

**Important Notes:**
- You cannot deduct more credits than a user currently has
- All credit adjustments are logged in the audit log
- Users will see their updated balance immediately

### Audit Logs

The Audit Logs tab shows:
- Date and time of action
- Admin who performed the action
- Action type (ADD_CREDITS or DEDUCT_CREDITS)
- Target user
- Details (amount, reason, new balance)

### Search Functionality

Use the search bar to filter users by:
- Email address
- User ID

## API Endpoints

The Super Admin feature adds the following API endpoints:

### Get All Users
```
GET /api/admin/users
Authorization: Bearer <token>
```

### Get User Statistics
```
GET /api/admin/statistics
Authorization: Bearer <token>
```

### Add Credits
```
POST /api/admin/credits/add
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-uuid",
  "cubes": 1000,
  "reason": "Promotional credit"
}
```

### Deduct Credits
```
POST /api/admin/credits/deduct
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-uuid",
  "cubes": 500,
  "reason": "Refund adjustment"
}
```

### Get Audit Logs
```
GET /api/admin/audit-logs?limit=100&offset=0
Authorization: Bearer <token>
```

### Get User Details
```
GET /api/admin/users/:userId
Authorization: Bearer <token>
```

## Security

### Authorization

- All super admin endpoints require authentication
- The `requireSuperAdmin` middleware checks if the authenticated user has `is_super_admin = TRUE`
- Non-admin users receive a 403 Forbidden response
- All administrative actions are logged with timestamp, admin ID, and action details

### Database Security

- Row Level Security (RLS) policies ensure only super admins can access admin tables
- Database functions use `SECURITY DEFINER` to safely execute privileged operations
- Audit logs are immutable and track all credit adjustments

### Best Practices

1. **Limit Super Admin Access**: Only grant super admin privileges to trusted users
2. **Use Reasons**: Always provide a reason when adjusting credits for audit trail
3. **Review Audit Logs**: Regularly review the audit logs for suspicious activity
4. **Secure Environment Variables**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is kept secret
5. **Monitor Token Distribution**: Use statistics to track overall platform usage

## Troubleshooting

### "Access denied. Super admin privileges required."

- Verify you've run the database migration
- Check that your user has `is_super_admin = TRUE` in the `user_tokens` table
- Ensure you're logged in with the correct account
- Try logging out and logging back in

### "Failed to load admin data"

- Check backend logs for errors
- Verify Supabase connection is working
- Ensure database functions were created successfully
- Check that RLS policies are enabled

### Can't see the Super Admin link in sidebar

- The link should appear for all users in the "Administration" section
- The page will show an access denied error if you're not a super admin
- This is intentional - the link is visible but access is restricted

## Database Schema

### user_tokens table
```sql
- user_id (UUID, PRIMARY KEY)
- balance (INTEGER)
- total_purchased (INTEGER)
- total_consumed (INTEGER)
- is_super_admin (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### admin_audit_log table
```sql
- id (UUID, PRIMARY KEY)
- admin_user_id (UUID)
- action_type (VARCHAR)
- target_user_id (UUID)
- details (JSONB)
- created_at (TIMESTAMP)
```

## Support

For issues or questions:
1. Check the backend logs for error messages
2. Review the Supabase database logs
3. Verify database functions are created correctly
4. Check that all migrations have been applied

## Future Enhancements

Potential features to add:
- Bulk credit operations
- User suspension/activation
- Email notifications for credit changes
- Export user data to CSV
- Advanced filtering and sorting
- Credit usage analytics
- Rate limiting for admin actions
