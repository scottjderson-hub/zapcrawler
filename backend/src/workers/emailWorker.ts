import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../config/database';
import { db } from '../adapters/databaseAdapter';
import { EmailService } from '../services/emailService';
import { logger } from '../utils/logger';
import { supabaseRealtime } from '../services/supabaseRealtime';
import { Worker } from '../services/queueService';

interface Job {
  id: string;
  name: string;
  data: any;
  timestamp: Date;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  result?: any;
  error?: any;
  userId: string; // Add user context
  remove: () => Promise<void>;
}

// Helper to get last sync date from either MongoDB or Supabase account
function getLastSync(account: any): string | undefined {
  if ('last_sync' in account && typeof account.last_sync === 'string') return account.last_sync;
  if ('lastSync' in account && account.lastSync instanceof Date) return account.lastSync.toISOString();
  return undefined;
}

const processJob = async (job: Job) => {
  const startTime = Date.now();
  logger.info(`[WORKER] Starting to process job ${job.id} with data:`, JSON.stringify(job.data, null, 2));
  
  const { syncJobId, accountId, folders, proxy: jobProxy } = job.data;  // Rename to avoid shadowing
  logger.info(`[WORKER] Processing job ${job.id} for account ${accountId}`);

  // Log proxy from job data
  if (jobProxy) {
    logger.info(`[WORKER] Job has proxy configuration:`, {
      host: jobProxy.host,
      port: jobProxy.port,
      type: jobProxy.type,
      hasPassword: !!jobProxy.password
    });
  } else {
    logger.info(`[WORKER] Job has no proxy configuration`);
  }

  let account;

  try {
    // Get account using database adapter
    logger.info(`[WORKER] Fetching account ${accountId} from database`);
    account = await db.getAccountById(accountId);

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // If account has proxy details in auth, use them directly
    const accountWithProxy = account as any; // Temporary type assertion
    if (accountWithProxy.auth?.proxy) {
      try {
        // Use proxy details from auth (only if no jobProxy provided)
        const authProxy = accountWithProxy.auth.proxy;

        // Only use authProxy if jobProxy is not provided
        if (!jobProxy) {
          logger.info(`[WORKER] Using proxy from auth config: ${authProxy.host}:${authProxy.port}`);

          // Enhanced password handling to ensure it's not truncated
          const password = typeof authProxy.password === 'string' ? authProxy.password :
                          authProxy.password ? String(authProxy.password) : '';

          // Ensure proxy details are properly set in the account
          accountWithProxy.proxy = {
            host: authProxy.host,
            port: authProxy.port,
            type: authProxy.type === 'SOCKS4' ? 4 : 5, // Default to SOCKS5 if not specified
            userId: authProxy.userId || authProxy.username || 'user',
            password: password,
            // Add raw password properties for debugging
            _passwordLength: password.length,
            _passwordType: typeof password,
            _passwordStartsWith: password ? password.substring(0, 3) + '...' : 'undefined',
            _passwordEndsWith: password.length > 3 ? '...' + password.slice(-3) : 'undefined'
          };

          // Log the proxy configuration for debugging (without logging the actual password)
          logger.info(`[WORKER] Proxy configuration:`, {
            host: accountWithProxy.proxy.host,
            port: accountWithProxy.proxy.port,
            type: accountWithProxy.proxy.type,
            userId: accountWithProxy.proxy.userId,
            passwordLength: accountWithProxy.proxy._passwordLength,
            passwordType: accountWithProxy.proxy._passwordType,
            passwordStartsWith: accountWithProxy.proxy._passwordStartsWith,
            passwordEndsWith: accountWithProxy.proxy._passwordEndsWith
          });

          // Verify password is not truncated
          if (password && password.length <= 3) {
            logger.warn(`[WORKER] WARNING: Proxy password is very short (${password.length} chars). This might cause authentication issues.`);
          }
        } else {
          logger.info(`[WORKER] Job proxy takes precedence over auth proxy`);
        }
      } catch (error) {
        logger.error(`[WORKER] Error fetching proxy for account ${accountId}:`, error);
        // Continue without proxy if there's an error fetching it
      }
    }

    // Log account details
    logger.info(`[WORKER] Account details:`, {
      id: account.id,
      email: account.email,
      provider: account.provider,
      status: account.status,
      proxy_configured: !!accountWithProxy.proxy_id,
      folders_count: Array.isArray(accountWithProxy.folders) ? accountWithProxy.folders.length : 'unknown',
      last_sync: accountWithProxy.last_sync || 'unknown'
    });
    
    // Log proxy details if available
    if (accountWithProxy.proxy) {
      logger.info(`[WORKER] Using proxy: ${accountWithProxy.proxy.host}:${accountWithProxy.proxy.port} (${accountWithProxy.proxy.type})`);
    } else if (!accountWithProxy.proxy_id) {
      logger.warn(`[WORKER] No proxy configured for account ${accountId}`);
    }
  
    if (!account) {
      const error = new Error(`Account ${accountId} not found for job ${job.id}`);
      logger.error(`[WORKER] ${error.message}`);
      throw error;
    }

    const emailService = new EmailService();

    try {
      switch (job.name) {
        case 'process-email-account':
          logger.info(`[WORKER] Processing email account connection for ${account.email} (${account.id})`);
          await emailService.testConnection(account.provider, account.auth, undefined, job.userId);
          account.status = 'connected';
          
          await supabaseRealtime.broadcastEmailAccountUpdate({
            id: account.id,
            status: 'connected',
            last_sync: getLastSync(account),
            error_message: ''
          });
          logger.info(`Successfully connected to ${account.email}. Job ${job.id} completed.`);
          break;

        case 'sync-email':
        case 'sync-folders':
          logger.info(`[WORKER] Starting sync for account ${account.email} with sync job ID: ${syncJobId}`);
          
          // Update job status to running with timestamp
          const updateTime = new Date().toISOString();
          logger.info(`[WORKER] Updating job ${syncJobId} status to 'running' at ${updateTime}`);
          
          await db.updateSyncJob(syncJobId, { 
            status: 'running',
            started_at: updateTime
          } as any);
          
          // Update account status
          logger.info(`[WORKER] Updating account ${accountId} status to 'syncing'`);
          await db.updateAccount(account.id, { status: 'syncing' });
          await supabaseRealtime.broadcastEmailAccountUpdate({
            id: account.id,
            status: 'syncing',
            last_sync: getLastSync(account),
            error_message: ''
          });
          
          // Log sync configuration
          const syncConfig = {
            accountId,
            syncJobId,
            folders: folders || 'All folders',
            proxyConfigured: !!(account as any).proxy,
            provider: account.provider,
            syncType: 'full'
          };
          
          logger.info(`[WORKER] Sync configuration:`, syncConfig);
          
          // Start the sync process with proper error handling
          logger.info(`[WORKER] Calling emailService.syncFolders()`);
          const startSyncTime = Date.now();
          
          try {
            await emailService.syncFolders(syncJobId, account as any, folders, jobProxy, job.userId);
            const syncDuration = ((Date.now() - startSyncTime) / 1000).toFixed(2);
            logger.info(`[WORKER] Sync completed successfully in ${syncDuration}s`);

            // Update sync job using database adapter
            logger.info(`Updating sync job ${syncJobId} status to 'completed'`);
            await db.updateSyncJob(syncJobId, { 
              status: 'completed', 
              completed_at: new Date().toISOString() 
            });
            
            // Update account status and last sync time
            logger.info(`Updating account ${accountId} status to 'connected'`);
            await db.updateAccount(account.id, { 
              status: 'connected', 
              last_sync: new Date().toISOString() 
            });
            await supabaseRealtime.broadcastEmailAccountUpdate({
              id: account.id,
              status: 'connected',
              last_sync: getLastSync(account),
              error_message: ''
            });
            logger.info(`Successfully synced folders for ${account.email}. Job ${job.id} completed.`);
          } catch (syncError: any) {
            const errorDuration = ((Date.now() - startSyncTime) / 1000).toFixed(2);
            
            // Handle IMAP socket timeouts gracefully without crashing the worker
            if (syncError.message?.includes('Socket timeout') || 
                syncError.message?.includes('timed out') || 
                syncError.code === 'ETIMEOUT') {
              logger.warn(`[WORKER] Sync timed out after ${errorDuration}s (non-fatal):`, syncError.message);
              // Mark job as completed with partial results instead of failed
              await db.updateSyncJob(syncJobId, { 
                status: 'completed', 
                completed_at: new Date().toISOString(),
                error: `Partial sync completed - timed out after ${errorDuration}s`
              });
              await db.updateAccount(account.id, { 
                status: 'connected', 
                last_sync: new Date().toISOString(),
                error_message: `Partial sync - timed out after ${errorDuration}s`
              });
              await supabaseRealtime.broadcastEmailAccountUpdate({
                id: account.id,
                status: 'connected',
                last_sync: new Date().toISOString(),
                error_message: `Partial sync - timed out after ${errorDuration}s`
              });
              logger.info(`[WORKER] Partial sync completed for ${account.email} due to timeout. Job ${job.id} marked as completed.`);
              return; // Don't throw for timeout errors
            }
            
            logger.error(`[WORKER] Sync failed after ${errorDuration}s:`, syncError);
            throw syncError; // Re-throw non-timeout errors to be caught by the outer try-catch
          }
          break;

        default:
          logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error: any) {
      const errorMessage = `[WORKER] Error processing job ${job.id} for account ${accountId}: ${error.message || 'Unknown error'}`;
      logger.error(errorMessage, error);
      
      try {
        if (syncJobId) {
          const errorTime = new Date().toISOString();
          const duration = (Date.now() - startTime) / 1000; // in seconds
          
          logger.error(`[WORKER] Error processing job ${job.id} after ${duration.toFixed(2)} seconds:`, {
            error: error.message,
            stack: error.stack,
            jobData: job.data
          });
          
          // Update job status to failed with error details
          logger.error(`[WORKER] Updating job ${syncJobId} status to 'failed' at ${errorTime}`);
          
          await db.updateSyncJob(syncJobId, { 
            status: 'failed',
            error: error.message,
            completed_at: errorTime,
            duration: Math.floor(duration),
            error_details: {
              name: error.name,
              message: error.message,
              stack: error.stack,
              code: (error as any).code,
              syscall: (error as any).syscall,
              address: (error as any).address,
              port: (error as any).port
            }
          } as any);
          
          logger.info(`[WORKER] Successfully marked job ${syncJobId} as failed`);
        } else {
          logger.warn(`[WORKER] No syncJobId found in job data, cannot update sync job status`);
        }
        
        if (account) {
          logger.info(`[WORKER] Updating account ${accountId} status to 'error'`);
          await db.updateAccount(account.id, { 
            status: 'error', 
            error_message: error.message || 'Failed to process job.' 
          });
          
          await supabaseRealtime.broadcastEmailAccountUpdate({
            id: account.id,
            status: 'error',
            error_message: error.message || 'Failed to process job.'
          });
          logger.info(`[WORKER] Successfully updated account status and broadcasted update`);
        } else {
          logger.warn(`[WORKER] No account found, cannot update account status`);
        }
      } catch (updateError) {
        logger.error(`[WORKER] Failed to update job/account status after error:`, updateError);
      }

      // Re-throw the error so BullMQ marks the job as failed
      throw error;
    }
  } catch (error: any) {
    logger.error(`[WORKER] Unhandled error in processJob:`, error);
    throw error; // Re-throw to ensure BullMQ marks the job as failed
  }
};

const startWorker = async () => {
  try {
    logger.info('[WORKER] Starting email worker...');
    
    // Connect to the database first
    logger.info('[WORKER] Connecting to database...');
    await connectDB();
    logger.info('[WORKER] Database connected for worker.');

    logger.info('[WORKER] Initializing worker with simple in-memory queue...');
    const worker = new Worker('email-account-queue', processJob);

    worker.on('ready', () => {
      logger.info('[WORKER] Worker is ready and listening for jobs');
    });

    worker.on('active', (job: Job) => {
      logger.info(`[WORKER] Job ${job.id} is now active`);
    });

    worker.on('completed', (job: Job, result: any) => {
      logger.info(`[WORKER] Job ${job.id} has completed successfully with result:`, result);
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
      if (job) {
        logger.error(`[WORKER] Job ${job.id} has failed with error:`, err);
      } else {
        logger.error('[WORKER] An unknown job has failed with error:', err);
      }
    });

    worker.on('error', (err: Error) => {
      logger.error('[WORKER] Worker encountered an error:', err);
    });

    worker.on('stalled', (jobId: string) => {
      logger.warn(`[WORKER] Job ${jobId} has stalled and will be reprocessed`);
    });

    worker.on('closing', () => {
      logger.info('[WORKER] Worker is closing...');
    });

    worker.on('closed', () => {
      logger.info('[WORKER] Worker has closed');
    });

    logger.info('Email worker started and is listening for jobs.');
  } catch (error) {
    logger.error('Failed to start email worker:', error);
    process.exit(1);
  }
};

// Start the worker
startWorker().catch(error => {
  logger.error('Failed to start worker:', error);
  process.exit(1);
});
