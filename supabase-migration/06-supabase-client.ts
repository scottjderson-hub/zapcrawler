// Supabase Client Configuration for Mail Discovery Central
import { createClient } from '@supabase/supabase-js';

// Environment variables (add to your .env file)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for frontend operations (with RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for backend operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Type definitions matching your Supabase schema
export interface SupabaseEmailAccount {
  id: string;
  email: string;
  provider: string;
  auth: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error' | 'invalid' | 'syncing';
  proxy_id?: string;
  folders?: any[];
  last_sync?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSyncJob {
  id: string;
  name: string;
  account_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results_key?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
  result_count?: number;
  current_count?: number;
  processed_folders?: number;
  total_folders?: number;
  batch_sync_job_id?: string;
  parent_job_id?: string;
  child_job_ids?: string[];
  batch_progress?: {
    completed: number;
    total: number;
    results: any[];
  };
  created_at: string;
  updated_at: string;
}

export interface SupabaseProxy {
  id: string;
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  user_id?: string;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseExtractedEmail {
  id: string;
  sync_job_id: string;
  account_id: string;
  email: string;
  domain?: string;
  provider?: string;
  mx_server?: string;
  folder?: string;
  extracted_at: string;
}

// Database table names
export const TABLES = {
  EMAIL_ACCOUNTS: 'email_accounts',
  SYNC_JOBS: 'sync_jobs',
  PROXIES: 'proxies',
  EXTRACTED_EMAILS: 'extracted_emails'
} as const;

// Real-time subscription helpers
export const subscribeToSyncJobs = (callback: (payload: any) => void) => {
  return supabase
    .channel('sync-jobs-changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'sync_jobs' },
      callback
    )
    .subscribe();
};

export const subscribeToAccountStatus = (callback: (payload: any) => void) => {
  return supabase
    .channel('account-status-changes')
    .on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'email_accounts' },
      callback
    )
    .subscribe();
};

// Utility functions for common operations
export const supabaseUtils = {
  // Get all accounts
  async getAccounts(): Promise<SupabaseEmailAccount[]> {
    const { data, error } = await supabase
      .from(TABLES.EMAIL_ACCOUNTS)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  // Get account by email
  async getAccountByEmail(email: string): Promise<SupabaseEmailAccount | null> {
    const { data, error } = await supabase
      .from(TABLES.EMAIL_ACCOUNTS)
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  // Create new account
  async createAccount(account: Omit<SupabaseEmailAccount, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseEmailAccount> {
    const { data, error } = await supabase
      .from(TABLES.EMAIL_ACCOUNTS)
      .insert(account)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update account status
  async updateAccountStatus(id: string, status: SupabaseEmailAccount['status'], errorMessage?: string) {
    const { error } = await supabase
      .from(TABLES.EMAIL_ACCOUNTS)
      .update({ 
        status, 
        error_message: errorMessage,
        last_sync: status === 'connected' ? new Date().toISOString() : undefined
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  // Get sync jobs for account
  async getSyncJobsForAccount(accountId: string): Promise<SupabaseSyncJob[]> {
    const { data, error } = await supabase
      .from(TABLES.SYNC_JOBS)
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  // Create sync job
  async createSyncJob(job: Omit<SupabaseSyncJob, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseSyncJob> {
    const { data, error } = await supabase
      .from(TABLES.SYNC_JOBS)
      .insert(job)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update sync job progress
  async updateSyncJobProgress(
    id: string, 
    updates: Partial<Pick<SupabaseSyncJob, 'status' | 'current_count' | 'result_count' | 'processed_folders' | 'error' | 'completed_at'>>
  ) {
    const { error } = await supabase
      .from(TABLES.SYNC_JOBS)
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
  },

  // Get batch sync progress
  async getBatchSyncProgress(batchId: string) {
    const { data, error } = await supabase
      .rpc('get_batch_sync_progress', { batch_job_id: batchId });
    
    if (error) throw error;
    return data;
  }
};
