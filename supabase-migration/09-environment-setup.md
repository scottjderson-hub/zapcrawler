# Environment Setup for Supabase Migration

## 1. Install Dependencies

```bash
# Navigate to your project
cd /Users/dex/Downloads/ZapCrawler/mail-discovery-central

# Install Supabase client
npm install @supabase/supabase-js

# Install TypeScript types (if needed)
npm install -D @types/node
```

## 2. Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Feature Flags for Gradual Migration
USE_SUPABASE_ACCOUNTS=false
USE_SUPABASE_SYNC_JOBS=false
USE_SUPABASE_REALTIME=false

# Keep existing MongoDB config during transition
MONGODB_URI=mongodb://localhost:27017/mail-discovery-central
```

## 3. Migration Commands

```bash
# Dry run migration (safe to test)
npx ts-node supabase-migration/07-migration-service.ts --dry-run

# Live migration (when ready)
npx ts-node supabase-migration/07-migration-service.ts --live

# Verify migration
npx ts-node supabase-migration/07-migration-service.ts --verify
```

## 4. Gradual Rollout Plan

### Phase 1: Setup & Test (Week 1)
- [ ] Create Supabase project
- [ ] Run database schema scripts
- [ ] Test migration with dry run
- [ ] Benchmark performance comparison

### Phase 2: Accounts Migration (Week 2)
- [ ] Set `USE_SUPABASE_ACCOUNTS=true`
- [ ] Migrate accounts table
- [ ] Test account operations
- [ ] Monitor for issues

### Phase 3: Sync Jobs Migration (Week 3)
- [ ] Set `USE_SUPABASE_SYNC_JOBS=true`
- [ ] Migrate sync jobs
- [ ] Test batch sync functionality
- [ ] Monitor performance

### Phase 4: Real-time Features (Week 4)
- [ ] Set `USE_SUPABASE_REALTIME=true`
- [ ] Replace WebSocket with Supabase real-time
- [ ] Test progress tracking
- [ ] Remove WebSocket dependency

### Phase 5: Cleanup (Week 5)
- [ ] Remove MongoDB dependencies
- [ ] Clean up old code
- [ ] Update documentation
- [ ] Production deployment

## 5. Rollback Plan

If issues occur, you can instantly rollback by changing environment variables:

```bash
# Rollback to MongoDB
USE_SUPABASE_ACCOUNTS=false
USE_SUPABASE_SYNC_JOBS=false
USE_SUPABASE_REALTIME=false
```

No code changes needed - the adapter handles the switch automatically.

## 6. Performance Monitoring

Monitor these metrics during migration:

- Query response times
- Real-time update latency
- Connection stability
- Memory usage
- Error rates

## 7. Success Criteria

Migration is successful when:
- [ ] All data migrated correctly
- [ ] Performance improved by 3-5x
- [ ] Real-time features working
- [ ] No data loss
- [ ] Rollback capability maintained
