// API Adapter for gradual migration from MongoDB to Supabase
// This allows switching between databases with feature flags

import { supabaseUtils, SupabaseEmailAccount, SupabaseSyncJob } from './06-supabase-client';
import EmailAccount, { IEmailAccount } from '../backend/src/models/EmailAccount';
import SyncJob, { ISyncJob } from '../backend/src/models/SyncJob';

// Feature flags for gradual migration
const FEATURE_FLAGS = {
  USE_SUPABASE_ACCOUNTS: process.env.USE_SUPABASE_ACCOUNTS === 'true',
  USE_SUPABASE_SYNC_JOBS: process.env.USE_SUPABASE_SYNC_JOBS === 'true',
  USE_SUPABASE_REALTIME: process.env.USE_SUPABASE_REALTIME === 'true'
};

// Database adapter that can switch between MongoDB and Supabase
export class DatabaseAdapter {
  
  // Account operations
  async getAccounts(): Promise<IEmailAccount[] | SupabaseEmailAccount[]> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS) {
      return await supabaseUtils.getAccounts();
    } else {
      return await EmailAccount.find({}).populate('proxy').sort({ createdAt: -1 });
    }
  }

  async getAccountByEmail(email: string): Promise<IEmailAccount | SupabaseEmailAccount | null> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS) {
      return await supabaseUtils.getAccountByEmail(email);
    } else {
      return await EmailAccount.findOne({ email }).populate('proxy');
    }
  }

  async createAccount(accountData: any): Promise<IEmailAccount | SupabaseEmailAccount> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS) {
      // Convert MongoDB format to Supabase format
      const supabaseData = {
        email: accountData.email,
        provider: accountData.provider,
        auth: accountData.auth,
        status: accountData.status || 'disconnected',
        proxy_id: accountData.proxyId,
        folders: accountData.folders,
        error_message: accountData.errorMessage
      };
      return await supabaseUtils.createAccount(supabaseData);
    } else {
      const account = new EmailAccount(accountData);
      return await account.save();
    }
  }

  async updateAccountStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS) {
      await supabaseUtils.updateAccountStatus(id, status as any, errorMessage);
    } else {
      await EmailAccount.findByIdAndUpdate(id, { 
        status, 
        errorMessage,
        lastSync: status === 'connected' ? new Date() : undefined
      });
    }
  }

  // Sync job operations
  async getSyncJobsForAccount(accountId: string): Promise<ISyncJob[] | SupabaseSyncJob[]> {
    if (FEATURE_FLAGS.USE_SUPABASE_SYNC_JOBS) {
      return await supabaseUtils.getSyncJobsForAccount(accountId);
    } else {
      return await SyncJob.find({ accountId }).sort({ createdAt: -1 });
    }
  }

  async createSyncJob(jobData: any): Promise<ISyncJob | SupabaseSyncJob> {
    if (FEATURE_FLAGS.USE_SUPABASE_SYNC_JOBS) {
      // Convert MongoDB format to Supabase format
      const supabaseData = {
        name: jobData.name,
        account_id: jobData.accountId,
        status: jobData.status || 'pending',
        results_key: jobData.resultsKey,
        error: jobData.error,
        started_at: jobData.startedAt || new Date().toISOString(),
        completed_at: jobData.completedAt,
        result_count: jobData.resultCount || 0,
        current_count: jobData.currentCount || 0,
        processed_folders: jobData.processedFolders || 0,
        total_folders: jobData.totalFolders || 0,
        batch_sync_job_id: jobData.batchSyncJobId,
        parent_job_id: jobData.parentJobId,
        child_job_ids: jobData.childJobIds || [],
        batch_progress: jobData.batchProgress
      };
      return await supabaseUtils.createSyncJob(supabaseData);
    } else {
      const job = new SyncJob(jobData);
      return await job.save();
    }
  }

  async updateSyncJobProgress(id: string, updates: any): Promise<void> {
    if (FEATURE_FLAGS.USE_SUPABASE_SYNC_JOBS) {
      // Convert MongoDB field names to Supabase field names
      const supabaseUpdates: any = {};
      if (updates.status) supabaseUpdates.status = updates.status;
      if (updates.currentCount !== undefined) supabaseUpdates.current_count = updates.currentCount;
      if (updates.resultCount !== undefined) supabaseUpdates.result_count = updates.resultCount;
      if (updates.processedFolders !== undefined) supabaseUpdates.processed_folders = updates.processedFolders;
      if (updates.error) supabaseUpdates.error = updates.error;
      if (updates.completedAt) supabaseUpdates.completed_at = updates.completedAt;

      await supabaseUtils.updateSyncJobProgress(id, supabaseUpdates);
    } else {
      await SyncJob.findByIdAndUpdate(id, updates);
    }
  }

  async getBatchSyncProgress(batchId: string): Promise<any> {
    if (FEATURE_FLAGS.USE_SUPABASE_SYNC_JOBS) {
      return await supabaseUtils.getBatchSyncProgress(batchId);
    } else {
      // MongoDB implementation for batch progress
      const childJobs = await SyncJob.find({ parentJobId: batchId });
      const completed = childJobs.filter(job => job.status === 'completed').length;
      const failed = childJobs.filter(job => job.status === 'failed').length;
      const running = childJobs.filter(job => job.status === 'running').length;
      const pending = childJobs.filter(job => job.status === 'pending').length;
      const totalEmails = childJobs.reduce((sum, job) => sum + (job.resultCount || 0), 0);

      return {
        batchId,
        totalJobs: childJobs.length,
        completedJobs: completed,
        failedJobs: failed,
        runningJobs: running,
        pendingJobs: pending,
        totalEmails,
        progress: childJobs.length === 0 ? 0 : Math.round(((completed + failed) / childJobs.length) * 100)
      };
    }
  }
}

// Singleton instance
export const db = new DatabaseAdapter();

// Real-time subscription manager
export class RealtimeManager {
  private subscriptions: any[] = [];

  subscribeToSyncProgress(callback: (data: any) => void) {
    if (FEATURE_FLAGS.USE_SUPABASE_REALTIME) {
      // Use Supabase real-time
      const { subscribeToSyncJobs } = require('./06-supabase-client');
      const subscription = subscribeToSyncJobs((payload: any) => {
        callback({
          type: 'sync_job_update',
          data: payload.new,
          eventType: payload.eventType
        });
      });
      this.subscriptions.push(subscription);
      return subscription;
    } else {
      // Use existing WebSocket implementation
      // This would integrate with your existing WebSocket service
      console.log('Using existing WebSocket for real-time updates');
      return null;
    }
  }

  subscribeToAccountStatus(callback: (data: any) => void) {
    if (FEATURE_FLAGS.USE_SUPABASE_REALTIME) {
      const { subscribeToAccountStatus } = require('./06-supabase-client');
      const subscription = subscribeToAccountStatus((payload: any) => {
        callback({
          type: 'account_status_update',
          data: payload.new,
          eventType: payload.eventType
        });
      });
      this.subscriptions.push(subscription);
      return subscription;
    } else {
      console.log('Using existing WebSocket for account status updates');
      return null;
    }
  }

  unsubscribeAll() {
    this.subscriptions.forEach(sub => {
      if (sub && sub.unsubscribe) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
  }
}

// Export feature flags for use in other parts of the app
export { FEATURE_FLAGS };
