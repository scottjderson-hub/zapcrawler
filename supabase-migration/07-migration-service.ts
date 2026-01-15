// Migration Service for MongoDB to Supabase
// This service handles the gradual migration of data from MongoDB to Supabase

import mongoose from 'mongoose';
import EmailAccount from '../backend/src/models/EmailAccount';
import SyncJob from '../backend/src/models/SyncJob';
import { Proxy } from '../backend/src/models/Proxy';
import { supabaseAdmin, SupabaseEmailAccount, SupabaseSyncJob, SupabaseProxy, TABLES } from './06-supabase-client';

export class MigrationService {
  private dryRun: boolean;

  constructor(dryRun = true) {
    this.dryRun = dryRun;
  }

  // Migrate all proxies from MongoDB to Supabase
  async migrateProxies(): Promise<{ success: number; failed: number; errors: string[] }> {
    console.log(`${this.dryRun ? '[DRY RUN] ' : ''}Starting proxy migration...`);
    
    const stats = { success: 0, failed: 0, errors: [] as string[] };
    
    try {
      const mongoProxies = await Proxy.find({});
      console.log(`Found ${mongoProxies.length} proxies to migrate`);

      for (const mongoProxy of mongoProxies) {
        try {
          const supabaseProxy: Omit<SupabaseProxy, 'id' | 'created_at' | 'updated_at'> = {
            name: mongoProxy.name,
            host: mongoProxy.host,
            port: mongoProxy.port,
            type: mongoProxy.type,
            user_id: mongoProxy.userId,
            password: mongoProxy.password
          };

          if (!this.dryRun) {
            const { error } = await supabaseAdmin
              .from(TABLES.PROXIES)
              .insert(supabaseProxy);

            if (error) throw error;
          }

          console.log(`✓ Migrated proxy: ${mongoProxy.name}`);
          stats.success++;
        } catch (error) {
          const errorMsg = `Failed to migrate proxy ${mongoProxy.name}: ${error}`;
          console.error(`✗ ${errorMsg}`);
          stats.errors.push(errorMsg);
          stats.failed++;
        }
      }
    } catch (error) {
      stats.errors.push(`Migration failed: ${error}`);
      stats.failed++;
    }

    return stats;
  }

  // Migrate email accounts from MongoDB to Supabase
  async migrateEmailAccounts(): Promise<{ success: number; failed: number; errors: string[] }> {
    console.log(`${this.dryRun ? '[DRY RUN] ' : ''}Starting email accounts migration...`);
    
    const stats = { success: 0, failed: 0, errors: [] as string[] };
    
    try {
      const mongoAccounts = await EmailAccount.find({}).populate('proxy');
      console.log(`Found ${mongoAccounts.length} email accounts to migrate`);

      for (const mongoAccount of mongoAccounts) {
        try {
          // Find corresponding proxy in Supabase if it exists
          let proxyId: string | undefined;
          if (mongoAccount.proxy) {
            const { data: supabaseProxy } = await supabaseAdmin
              .from(TABLES.PROXIES)
              .select('id')
              .eq('name', (mongoAccount.proxy as any).name)
              .single();
            
            proxyId = supabaseProxy?.id;
          }

          const supabaseAccount: Omit<SupabaseEmailAccount, 'id' | 'created_at' | 'updated_at'> = {
            email: mongoAccount.email,
            provider: mongoAccount.provider,
            auth: mongoAccount.auth,
            status: mongoAccount.status,
            proxy_id: proxyId,
            folders: mongoAccount.folders,
            last_sync: mongoAccount.lastSync?.toISOString(),
            error_message: mongoAccount.errorMessage
          };

          if (!this.dryRun) {
            const { error } = await supabaseAdmin
              .from(TABLES.EMAIL_ACCOUNTS)
              .insert(supabaseAccount);

            if (error) throw error;
          }

          console.log(`✓ Migrated account: ${mongoAccount.email}`);
          stats.success++;
        } catch (error) {
          const errorMsg = `Failed to migrate account ${mongoAccount.email}: ${error}`;
          console.error(`✗ ${errorMsg}`);
          stats.errors.push(errorMsg);
          stats.failed++;
        }
      }
    } catch (error) {
      stats.errors.push(`Migration failed: ${error}`);
      stats.failed++;
    }

    return stats;
  }

  // Migrate sync jobs from MongoDB to Supabase
  async migrateSyncJobs(): Promise<{ success: number; failed: number; errors: string[] }> {
    console.log(`${this.dryRun ? '[DRY RUN] ' : ''}Starting sync jobs migration...`);
    
    const stats = { success: 0, failed: 0, errors: [] as string[] };
    
    try {
      const mongoJobs = await SyncJob.find({}).populate('accountId');
      console.log(`Found ${mongoJobs.length} sync jobs to migrate`);

      // Create a mapping of MongoDB account IDs to Supabase account IDs
      const accountIdMapping = new Map<string, string>();
      
      for (const mongoJob of mongoJobs) {
        try {
          // Get the corresponding Supabase account ID
          let accountId = accountIdMapping.get(mongoJob.accountId.toString());
          
          if (!accountId) {
            const mongoAccount = await EmailAccount.findById(mongoJob.accountId);
            if (mongoAccount) {
              const { data: supabaseAccount } = await supabaseAdmin
                .from(TABLES.EMAIL_ACCOUNTS)
                .select('id')
                .eq('email', mongoAccount.email)
                .single();
              
              if (supabaseAccount) {
                accountId = supabaseAccount.id;
                accountIdMapping.set(mongoJob.accountId.toString(), accountId);
              }
            }
          }

          if (!accountId) {
            throw new Error(`Could not find corresponding Supabase account for MongoDB account ${mongoJob.accountId}`);
          }

          const supabaseJob: Omit<SupabaseSyncJob, 'id' | 'created_at' | 'updated_at'> = {
            name: mongoJob.name,
            account_id: accountId,
            status: mongoJob.status,
            results_key: mongoJob.resultsKey,
            error: mongoJob.error,
            started_at: mongoJob.startedAt.toISOString(),
            completed_at: mongoJob.completedAt?.toISOString(),
            result_count: mongoJob.resultCount,
            current_count: mongoJob.currentCount,
            processed_folders: mongoJob.processedFolders,
            total_folders: mongoJob.totalFolders,
            batch_sync_job_id: undefined, // Will be set in second pass for batch jobs
            parent_job_id: undefined, // Will be set in second pass for batch jobs
            child_job_ids: [],
            batch_progress: mongoJob.batchProgress
          };

          if (!this.dryRun) {
            const { error } = await supabaseAdmin
              .from(TABLES.SYNC_JOBS)
              .insert(supabaseJob);

            if (error) throw error;
          }

          console.log(`✓ Migrated sync job: ${mongoJob.name}`);
          stats.success++;
        } catch (error) {
          const errorMsg = `Failed to migrate sync job ${mongoJob.name}: ${error}`;
          console.error(`✗ ${errorMsg}`);
          stats.errors.push(errorMsg);
          stats.failed++;
        }
      }
    } catch (error) {
      stats.errors.push(`Migration failed: ${error}`);
      stats.failed++;
    }

    return stats;
  }

  // Run complete migration
  async runFullMigration(): Promise<void> {
    console.log(`\n🚀 Starting full migration ${this.dryRun ? '(DRY RUN)' : '(LIVE)'}`);
    console.log('='.repeat(50));

    // Step 1: Migrate proxies
    console.log('\n📡 Step 1: Migrating Proxies');
    const proxyStats = await this.migrateProxies();
    console.log(`Proxies - Success: ${proxyStats.success}, Failed: ${proxyStats.failed}`);

    // Step 2: Migrate email accounts
    console.log('\n📧 Step 2: Migrating Email Accounts');
    const accountStats = await this.migrateEmailAccounts();
    console.log(`Accounts - Success: ${accountStats.success}, Failed: ${accountStats.failed}`);

    // Step 3: Migrate sync jobs
    console.log('\n⚙️ Step 3: Migrating Sync Jobs');
    const jobStats = await this.migrateSyncJobs();
    console.log(`Jobs - Success: ${jobStats.success}, Failed: ${jobStats.failed}`);

    // Summary
    console.log('\n📊 Migration Summary');
    console.log('='.repeat(50));
    console.log(`Total Success: ${proxyStats.success + accountStats.success + jobStats.success}`);
    console.log(`Total Failed: ${proxyStats.failed + accountStats.failed + jobStats.failed}`);
    
    const allErrors = [...proxyStats.errors, ...accountStats.errors, ...jobStats.errors];
    if (allErrors.length > 0) {
      console.log('\n❌ Errors:');
      allErrors.forEach(error => console.log(`  - ${error}`));
    }

    if (this.dryRun) {
      console.log('\n💡 This was a dry run. Set dryRun=false to perform actual migration.');
    } else {
      console.log('\n✅ Migration completed!');
    }
  }

  // Verify migration by comparing counts
  async verifyMigration(): Promise<void> {
    console.log('\n🔍 Verifying Migration');
    console.log('='.repeat(30));

    try {
      // Count MongoDB records
      const mongoProxyCount = await Proxy.countDocuments();
      const mongoAccountCount = await EmailAccount.countDocuments();
      const mongoJobCount = await SyncJob.countDocuments();

      // Count Supabase records
      const { count: supabaseProxyCount } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .select('*', { count: 'exact', head: true });

      const { count: supabaseAccountCount } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .select('*', { count: 'exact', head: true });

      const { count: supabaseJobCount } = await supabaseAdmin
        .from(TABLES.SYNC_JOBS)
        .select('*', { count: 'exact', head: true });

      console.log('Record Counts:');
      console.log(`Proxies: MongoDB=${mongoProxyCount}, Supabase=${supabaseProxyCount || 0}`);
      console.log(`Accounts: MongoDB=${mongoAccountCount}, Supabase=${supabaseAccountCount || 0}`);
      console.log(`Jobs: MongoDB=${mongoJobCount}, Supabase=${supabaseJobCount || 0}`);

      const isComplete = 
        mongoProxyCount === (supabaseProxyCount || 0) &&
        mongoAccountCount === (supabaseAccountCount || 0) &&
        mongoJobCount === (supabaseJobCount || 0);

      console.log(`\n${isComplete ? '✅' : '❌'} Migration ${isComplete ? 'Complete' : 'Incomplete'}`);
    } catch (error) {
      console.error('❌ Verification failed:', error);
    }
  }
}

// CLI usage
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--live');
  const migration = new MigrationService(dryRun);

  if (process.argv.includes('--verify')) {
    migration.verifyMigration();
  } else {
    migration.runFullMigration();
  }
}
