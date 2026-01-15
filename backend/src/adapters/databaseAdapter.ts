// Database adapter for Mail Discovery Central
// This adapter allows switching between MongoDB and Supabase

import { createClient } from '@supabase/supabase-js';
import EmailAccount, { IEmailAccount } from '../models/EmailAccount';
// Note: MongoDB models will be removed after complete migration

// Feature flags for complete migration - enabling all Supabase features
export const FEATURE_FLAGS = {
  USE_SUPABASE_ACCOUNTS: process.env.USE_SUPABASE_ACCOUNTS !== 'false', // Default to true
  USE_SUPABASE_SYNC_JOBS: process.env.USE_SUPABASE_SYNC_JOBS !== 'false', // Default to true
  USE_SUPABASE_PROXIES: process.env.USE_SUPABASE_PROXIES !== 'false', // Default to true
  USE_SUPABASE_EMAILS: process.env.USE_SUPABASE_EMAILS !== 'false', // Default to true
  USE_SUPABASE_REALTIME: process.env.USE_SUPABASE_REALTIME !== 'false', // Default to true
  COMPLETE_MIGRATION: process.env.COMPLETE_SUPABASE_MIGRATION !== 'false' // Default to true
};

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client for backend operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create user-scoped client for operations that respect RLS
export const createUserSupabaseClient = (userJwt: string) => {
  return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

// Type definitions for complete Supabase schema
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
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProxy {
  id: string;
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  user_id?: string; // UUID of the authenticated user (set by database trigger)
  username?: string; // Proxy authentication username
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSyncJob {
  id: string;
  name: string;
  account_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  results_key?: string;
  error: string | null;
  result_count?: number;
  parent_job_id?: string;
  completed_at: string | null;
  total_folders?: number;
  processed_folders?: number;
  current_count?: number;
  total_count?: number;
  progress?: number;
  started_at?: string;
  updated_at?: string;
  folders?: string[];
  since?: string | null;
  created_at?: string;
  bullmq_job_id?: string;
  extracted_emails?: string[]; // JSONB array of extracted emails
  email_count?: number; // Count of unique emails extracted
  user_id?: string;
}

export interface ExtractedEmail {
  id: string;
  job_id: string;
  email: string;
  folder: string;
  created_at: string;
  // Add optional fields that might be present in the database
  account_id?: string;
  sync_job_id?: string;
  updated_at?: string;
  user_id?: string;
}

// Database table names
export const TABLES = {
  EMAIL_ACCOUNTS: 'email_accounts',
  JOBS: 'email_jobs', // Using email_jobs table name as per current schema
  PROXIES: 'proxies',
  EXTRACTED_EMAILS: 'extracted_emails' // Note: This table doesn't exist in current schema
} as const;

// Database adapter for complete Supabase migration
export class DatabaseAdapter {
  // User-aware account operations (respects RLS)
  async getAccountsForUser(userJwt: string): Promise<SupabaseEmailAccount[]> {
    const userClient = createUserSupabaseClient(userJwt);
    
    // Get the current authenticated user
    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData.user) {
      throw new Error('Authentication failed');
    }
    
    const currentUserId = userData.user.id;
    
    // Query with RLS policies
    const { data, error } = await userClient
      .from(TABLES.EMAIL_ACCOUNTS)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // Manual filtering as fallback to ensure data isolation
    const filteredData = data?.filter(account => account.user_id === currentUserId) || [];
    
    return filteredData;
  }

  async createAccountForUser(userJwt: string, accountData: any): Promise<SupabaseEmailAccount> {
    const userClient = createUserSupabaseClient(userJwt);
    const { data, error } = await userClient
      .from(TABLES.EMAIL_ACCOUNTS)
      .insert({
        email: accountData.email,
        provider: accountData.provider,
        auth: accountData.auth,
        status: accountData.status,
        proxy_id: accountData.proxy_id,
        folders: accountData.folders,
        last_sync: accountData.last_sync,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getJobsForUser(userJwt: string): Promise<any[]> {
    const userClient = createUserSupabaseClient(userJwt);
    
    // Get the current authenticated user
    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData.user) {
      throw new Error('Authentication failed');
    }
    
    const currentUserId = userData.user.id;
    
    // Query with RLS policies
    const { data, error } = await userClient
      .from(TABLES.JOBS)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // Manual filtering as fallback to ensure data isolation
    const filteredData = data?.filter(job => job.user_id === currentUserId) || [];
    
    return filteredData;
  }

  async getProxiesForUser(userJwt: string): Promise<SupabaseProxy[]> {
    const userClient = createUserSupabaseClient(userJwt);
    
    // Get the current authenticated user
    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData.user) {
      throw new Error('Authentication failed');
    }
    
    const currentUserId = userData.user.id;
    
    // Query with RLS policies
    const { data, error } = await userClient
      .from(TABLES.PROXIES)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // Manual filtering as fallback to ensure data isolation
    const filteredData = data?.filter(proxy => proxy.user_id === currentUserId) || [];
    
    return filteredData;
  }

  async createJobForUser(userJwt: string, jobData: any): Promise<any> {
    const userClient = createUserSupabaseClient(userJwt);
    const { data, error } = await userClient
      .from(TABLES.JOBS)
      .insert(jobData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteJobForUser(userJwt: string, jobId: string): Promise<void> {
    const userClient = createUserSupabaseClient(userJwt);
    const { error } = await userClient
      .from(TABLES.JOBS)
      .delete()
      .eq('id', jobId);

    if (error) throw error;
  }

  async deleteAllJobsForUser(userJwt: string): Promise<void> {
    const userClient = createUserSupabaseClient(userJwt);
    const { error } = await userClient
      .from(TABLES.JOBS)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all user's jobs

    if (error) throw error;
  }

  async createProxyForUser(userJwt: string, proxyData: any): Promise<SupabaseProxy> {
    const userClient = createUserSupabaseClient(userJwt);
    const { data, error } = await userClient
      .from(TABLES.PROXIES)
      .insert({
        name: proxyData.name || `${proxyData.host}:${proxyData.port}`,
        host: proxyData.host,
        port: proxyData.port,
        type: proxyData.type,
        username: proxyData.username || proxyData.userId, // Proxy auth username
        password: proxyData.password,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateProxyForUser(userJwt: string, proxyId: string, proxyData: any): Promise<SupabaseProxy> {
    const userClient = createUserSupabaseClient(userJwt);
    const { data, error } = await userClient
      .from(TABLES.PROXIES)
      .update({
        name: proxyData.name,
        host: proxyData.host,
        port: proxyData.port,
        type: proxyData.type,
        username: proxyData.username || proxyData.userId, // Proxy auth username
        password: proxyData.password,
      })
      .eq('id', proxyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteProxyForUser(userJwt: string, proxyId: string): Promise<void> {
    const userClient = createUserSupabaseClient(userJwt);
    const { error } = await userClient
      .from(TABLES.PROXIES)
      .delete()
      .eq('id', proxyId);

    if (error) throw error;
  }

  // Account operations
  async getAccounts(): Promise<IEmailAccount[] | SupabaseEmailAccount[]> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } else {
      return await EmailAccount.find({}).populate('proxy').sort({ createdAt: -1 });
    }
  }

  async getAccountById(id: string): Promise<IEmailAccount | SupabaseEmailAccount | null> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } else {
      return await EmailAccount.findById(id).populate('proxy');
    }
  }

  async createAccount(accountData: any): Promise<IEmailAccount | SupabaseEmailAccount> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .insert({
          email: accountData.email,
          provider: typeof accountData.provider === 'object' ? JSON.stringify(accountData.provider) : accountData.provider,
          auth: accountData.auth,
          status: accountData.status || 'disconnected',
          proxy_id: accountData.proxy_id,
          folders: accountData.folders || [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const newAccount = new EmailAccount(accountData);
      return await newAccount.save();
    }
  }

  async updateAccount(id: string, updates: any): Promise<IEmailAccount | SupabaseEmailAccount | null> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      return await EmailAccount.findByIdAndUpdate(id, updates, { new: true });
    }
  }

  async deleteAccount(id: string): Promise<boolean> {
    if (FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { error } = await supabaseAdmin
        .from(TABLES.EMAIL_ACCOUNTS)
        .delete()
        .eq('id', id);
      
      return !error;
    } else {
      const result = await EmailAccount.findByIdAndDelete(id);
      return !!result;
    }
  }

  // Job operations - consolidated to use email_jobs table
  async updateSyncJob(jobId: string, updates: Partial<SupabaseSyncJob>): Promise<SupabaseSyncJob> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.JOBS)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Proxy operations
  async getProxies(): Promise<any[]> {
    if (FEATURE_FLAGS.USE_SUPABASE_PROXIES || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } else {
      // MongoDB fallback (you'd need to import Proxy model)
      // return await Proxy.find({}).sort({ createdAt: -1 });
      return [];
    }
  }

  async getProxyById(id: string): Promise<SupabaseProxy | null> {
    if (FEATURE_FLAGS.USE_SUPABASE_PROXIES || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data;
    } else {
      // MongoDB fallback
      return null;
    }
  }

  async createProxy(proxyData: any): Promise<SupabaseProxy> {
    if (FEATURE_FLAGS.USE_SUPABASE_PROXIES || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .insert({
          name: proxyData.name || `${proxyData.host}:${proxyData.port}`,
          host: proxyData.host,
          port: proxyData.port,
          type: proxyData.type || 'HTTP',
          username: proxyData.username, // Proxy auth username
          password: proxyData.password,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      throw new Error('MongoDB proxy creation not implemented in adapter');
    }
  }

  async updateProxy(id: string, proxyData: any): Promise<SupabaseProxy> {
    if (FEATURE_FLAGS.USE_SUPABASE_PROXIES || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .update({
          name: proxyData.name,
          host: proxyData.host,
          port: proxyData.port,
          type: proxyData.type,
          username: proxyData.username, // Proxy auth username
          password: proxyData.password,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      throw new Error('MongoDB proxy update not implemented in adapter');
    }
  }

  async deleteProxy(id: string): Promise<boolean> {
    if (FEATURE_FLAGS.USE_SUPABASE_PROXIES || FEATURE_FLAGS.COMPLETE_MIGRATION) {
      const { error } = await supabaseAdmin
        .from(TABLES.PROXIES)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } else {
      throw new Error('MongoDB proxy deletion not implemented in adapter');
    }
  }

  // Email Job Operations
  async createEmailJob(accountId: string, name: string = 'Email Extraction Job'): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.JOBS)
      .insert({
        account_id: accountId,
        name,
        status: 'running',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Error creating email job:', error);
      throw new Error('Failed to create email job');
    }
    
    return data.id;
  }

  async getEmailJob(jobId: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.JOBS)
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error) {
      console.error('Error getting email job:', error);
      return null;
    }
    
    return data;
  }

  // Get all jobs with optional filtering by account ID
  async getSyncJobs(accountId?: string): Promise<any[]> {
    try {
      let query = supabaseAdmin
        .from(TABLES.JOBS)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error listing jobs:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Error in getSyncJobs:', error);
      return [];
    }
  }

  // Delete a specific job by ID
  async deleteSyncJob(jobId: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from(TABLES.JOBS)
        .delete()
        .eq('id', jobId);
      
      if (error) {
        console.error('Error deleting job:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in deleteSyncJob:', error);
      return false;
    }
  }

  // Delete all jobs (with optional account ID filter)
  async deleteAllSyncJobs(accountId?: string): Promise<boolean> {
    try {
      let query = supabaseAdmin
        .from(TABLES.JOBS)
        .delete();
      
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      
      const { error } = await query;
      
      if (error) {
        console.error('Error deleting all jobs:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in deleteAllSyncJobs:', error);
      return false;
    }
  }

  // List jobs (alias for getSyncJobs for backward compatibility)
  async listEmailJobs(accountId?: string): Promise<any[]> {
    return this.getSyncJobs(accountId);
  }

  async completeEmailJob(jobId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLES.JOBS)
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      console.error('Error completing job:', error);
      throw new Error('Failed to complete job');
    }
  }

  // Email Operations
  async storeEmail(jobId: string, email: string, folder: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLES.EXTRACTED_EMAILS)
      .upsert(
        {
          job_id: jobId,
          email: email.toLowerCase().trim(),
          folder: folder
        },
        { onConflict: 'job_id,email,folder' }
      );

    if (error) {
      console.error('Error storing email:', error);
      throw new Error('Failed to store email');
    }
  }

  async getJobEmails(jobId: string): Promise<string[]> {
    try {
      // First get the job to access the extracted_emails array
      const { data: job, error: jobError } = await supabaseAdmin
        .from(TABLES.JOBS)
        .select('extracted_emails')
        .eq('id', jobId)
        .single();

      if (jobError) {
        console.error('Error fetching job:', jobError);
        throw new Error('Failed to fetch job');
      }

      if (!job || !job.extracted_emails || !Array.isArray(job.extracted_emails)) {
        return [];
      }

      // Return just the array of email strings
      return job.extracted_emails.filter((email): email is string => typeof email === 'string');
    } catch (error) {
      console.error('Error in getJobEmails:', error);
      throw new Error('Failed to fetch job emails');
    }
  }

  async getAccountEmails(accountId: string): Promise<Array<{email: string, folder: string}>> {
    try {
      // Get all jobs for this account
      const { data: jobs, error: jobsError } = await supabaseAdmin
        .from(TABLES.JOBS)
        .select('id, extracted_emails')
        .eq('account_id', accountId);

      if (jobsError) {
        console.error('Error fetching jobs for account:', jobsError);
        throw new Error('Failed to fetch jobs for account');
      }

      if (!jobs || jobs.length === 0) {
        return [];
      }

      // Collect all unique emails from all jobs
      const emailSet = new Set<string>();
      const result: Array<{email: string, folder: string}> = [];

      for (const job of jobs) {
        if (job.extracted_emails && Array.isArray(job.extracted_emails)) {
          for (const email of job.extracted_emails) {
            if (email && !emailSet.has(email)) {
              emailSet.add(email);
              result.push({
                email,
                folder: 'inbox' // Default folder since we don't store folder info in the current structure
              });
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error in getAccountEmails:', error);
      throw new Error('Failed to fetch account emails');
    }
  }

  async getExtractedEmails(accountId?: string, limit: number = 100): Promise<ExtractedEmail[]> {
    try {
      let query = supabaseAdmin
        .from(TABLES.EXTRACTED_EMAILS)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (accountId) {
        // First get job IDs for this account
        const { data: jobs } = await supabaseAdmin
          .from(TABLES.JOBS)
          .select('id')
          .eq('account_id', accountId);
        
        if (jobs && jobs.length > 0) {
          const jobIds = jobs.map(job => job.id);
          query = query.in('job_id', jobIds);
        } else {
          return [];
        }
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as ExtractedEmail[];
    } catch (error) {
      console.error('Error getting extracted emails:', error);
      return [];
    }
  }

  async createExtractedEmail(emailData: { 
    account_id: string; 
    sync_job_id: string; 
    email: string; 
    folder: string;
    message_id?: string;
    message_date?: Date;
  }): Promise<ExtractedEmail> {
    try {
      const insertData = {
        job_id: emailData.sync_job_id,
        email: emailData.email.toLowerCase().trim(),
        folder: emailData.folder,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from(TABLES.EXTRACTED_EMAILS)
        .upsert(insertData, { onConflict: 'job_id,email,folder' })
        .select()
        .single();
      
      if (error) {
        console.error('Error saving extracted email:', error, insertData);
        
        // Return a minimal object to prevent crashes
        const errorEmail: ExtractedEmail = {
          id: 'error',
          job_id: insertData.job_id,
          email: insertData.email,
          folder: insertData.folder,
          created_at: new Date().toISOString(),
          account_id: emailData.account_id,
          sync_job_id: emailData.sync_job_id
        };
        return errorEmail;
      }

      if (!data) {
        throw new Error('No data returned from Supabase upsert');
      }

      return data as ExtractedEmail;
    } catch (error) {
      console.error('Error in createExtractedEmail:', error);
      throw error;
    }
  }
}

// Singleton instance
export const db = new DatabaseAdapter();
