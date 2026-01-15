# Super Admin Dashboard - Quick Start Guide

## Setup Steps (5 minutes)

### Step 1: Run the Database Migration

1. Go to your **Supabase Dashboard**
2. Click **SQL Editor** in the sidebar
3. Click **New Query**
4. Copy and paste the entire contents of `supabase-migration/10-super-admin.sql`
5. Click **Run** (or press Ctrl+Enter)
6. Wait for "Success. No rows returned" message

### Step 2: Find Your User ID

**Quick Method (Browser Console):**
1. Log into your application
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Run this command:
```javascript
const { data: { user } } = await window.supabase.auth.getUser();
console.log('Your User ID:', user?.id);
```
5. Copy the UUID that appears

**Alternative Method (Supabase Dashboard):**
1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Find your email and copy the **UUID** column

### Step 3: Make Yourself Super Admin

1. In Supabase **SQL Editor**, run this query (replace `YOUR_USER_UUID` with your actual UUID):

```sql
INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed, is_super_admin)
VALUES ('YOUR_USER_UUID', 0, 0, 0, TRUE)
ON CONFLICT (user_id)
DO UPDATE SET is_super_admin = TRUE;
```

**Example with real UUID:**
```sql
INSERT INTO user_tokens (user_id, balance, total_purchased, total_consumed, is_super_admin)
VALUES ('123e4567-e89b-12d3-a456-426614174000', 0, 0, 0, TRUE)
ON CONFLICT (user_id)
DO UPDATE SET is_super_admin = TRUE;
```

### Step 4: Verify It Worked

Run this to confirm:
```sql
SELECT u.email, ut.is_super_admin, ut.balance
FROM auth.users u
LEFT JOIN user_tokens ut ON u.id = ut.user_id
WHERE u.id = 'YOUR_USER_UUID';
```

You should see `is_super_admin: true`

### Step 5: Access the Dashboard

1. **Log out** and **log back in** (to refresh your session)
2. Navigate to `/admin` in your browser
3. Or click **"Super Admin"** in the sidebar under "Administration"

**You're done!** 🎉

## Using the Dashboard

### View Statistics
The top cards show:
- Total users
- Tokens distributed
- Tokens consumed
- Number of super admins

### Manage Credits

**Add Credits:**
1. Find user in the list
2. Click the **+** button
3. Enter amount and optional reason
4. Click "Add Credits"

**Deduct Credits:**
1. Find user in the list
2. Click the **-** button
3. Enter amount and optional reason
4. Click "Deduct Credits"

### Search Users
- Use the search box to filter by email or user ID
- Search updates instantly as you type

### View Audit Logs
- Click the **"Audit Logs"** tab
- See all admin actions with timestamps
- Shows who did what, when, and why

## API Endpoints Reference

All endpoints require authentication token in header:
```
Authorization: Bearer <your-access-token>
```

### Get All Users
```bash
GET /api/admin/users
```

### Get Statistics
```bash
GET /api/admin/statistics
```

### Add Credits
```bash
POST /api/admin/credits/add
Content-Type: application/json

{
  "userId": "user-uuid",
  "cubes": 1000,
  "reason": "Welcome bonus"
}
```

### Deduct Credits
```bash
POST /api/admin/credits/deduct
Content-Type: application/json

{
  "userId": "user-uuid",
  "cubes": 500,
  "reason": "Refund"
}
```

### Get Audit Logs
```bash
GET /api/admin/audit-logs?limit=50&offset=0
```

## Troubleshooting

### "Access denied. Super admin privileges required"
- Verify you ran the UPDATE query with your correct user ID
- Log out and log back in to refresh your session
- Check `user_tokens` table: `SELECT * FROM user_tokens WHERE user_id = 'YOUR_UUID'`

### "Failed to load admin data"
- Check browser console for errors (F12)
- Verify backend is running: `cd backend && npm run dev`
- Check database functions were created: Look for `is_super_admin` in Supabase Functions

### Can't find the Super Admin link
- Link appears in sidebar under "Administration" section
- If you see it but get "Access denied", you're not set as super admin yet
- Follow Step 3 above to set super admin flag

### Changes not reflecting
- Clear browser cache and reload
- Log out and log back in
- Check if backend server restarted after adding routes

## Security Notes

- Only grant super admin to trusted users
- All actions are logged and cannot be deleted
- Use the "reason" field for audit trail
- Super admin can see all users and modify any balance
- Keep your Supabase Service Role Key secure

## What's Next?

After setup, you can:
1. Add welcome credits to new users
2. Issue refunds or corrections
3. Monitor platform token usage
4. Track admin activities via audit logs
5. View platform statistics

For detailed information, see [SUPER_ADMIN_SETUP.md](SUPER_ADMIN_SETUP.md)
