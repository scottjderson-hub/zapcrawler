# Supabase Migration Plan - Phase 1: Setup

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project: "mail-discovery-central"
3. Choose region closest to your users
4. Save these credentials:
   - Project URL: `https://your-project.supabase.co`
   - Anon Key: `your-anon-key`
   - Service Role Key: `your-service-role-key`

## 2. Install Supabase Dependencies

```bash
# Frontend
npm install @supabase/supabase-js

# Backend (optional - for admin operations)
npm install @supabase/supabase-js
```

## 3. Environment Variables

Add to `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 4. Database Schema Setup

Run the SQL migration scripts in Supabase SQL Editor:
- `02-schema.sql` - Create tables
- `03-rls.sql` - Row Level Security
- `04-functions.sql` - Database functions
- `05-realtime.sql` - Enable real-time subscriptions

## 5. Migration Strategy

**Parallel Migration Approach:**
- Keep MongoDB running alongside Supabase
- Migrate one feature at a time
- Use feature flags to switch between databases
- Gradual rollout with rollback capability

**Order of Migration:**
1. Accounts table (lowest risk)
2. Proxy table (simple structure)
3. Sync Jobs table (most complex)
4. Real-time features
5. Remove MongoDB dependency
