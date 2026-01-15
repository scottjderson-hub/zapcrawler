import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { logger } from '../utils/logger';
import { queueManager } from '../services/queueService';
import { autoDetectEmailSettings, validateEmailFormat, getProviderDisplayName } from '../services/autoDetectionService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseAdapter, supabaseAdmin, SupabaseSyncJob } from '../adapters/databaseAdapter';
import { SubscriptionService } from '../services/subscriptionService';
import { cancellationService } from '../services/cancellationService';
import { db, FEATURE_FLAGS } from '../adapters/databaseAdapter';
import { supabaseRealtime } from '../services/supabaseRealtime';

interface ExtractedEmail {
  email_address: string;
  source_folder: string | null;
  extracted_at: string;
}

const databaseAdapter = new DatabaseAdapter();
const emailService = new EmailService();

export const addEmailAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, provider, auth, proxy, proxyId } = req.body;
    
    // Check authentication
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Handle both legacy proxy object and new proxyId field
    let proxyObj = null;
    if (proxy) {
      proxyObj = proxy;
      logger.info('Received add account request with body:', { email, provider, auth, proxyId: proxy?._id || proxy?.id });
    } else if (proxyId && proxyId !== 'no-proxy') {
      const proxies = await db.getProxies();
      proxyObj = proxies.find(p => p.id === proxyId);
      logger.info('Received add account request with body:', { email, provider, auth, proxyId });
      
      if (!proxyObj) {
        logger.error(`Proxy not found for ID: ${proxyId}`);
        res.status(400).json({ success: false, message: 'Invalid proxy ID' });
        return;
      }
    } else {
      logger.info('Received add account request with body:', { email, provider, auth, proxyId: null });
    }

    // 1. Connect, fetch folders, and save in one atomic operation
    try {
      logger.info(`Attempting to connect and fetch folders for ${email}...`);
      const { folders, handler } = await emailService.connectAndFetchFolders(email, provider, auth, proxyObj);
      logger.info(`Successfully fetched ${folders.length} folders for ${email}.`);

      const accountData = {
        email,
        provider,
        auth,
        proxy_id: proxyObj?.id || null,
        status: 'connected' as const,
        folders,
        last_sync: new Date().toISOString(),
        user_id: req.user?.id,
      };
      
      logger.info(`[addEmailAccount] Account data to save: ${JSON.stringify(accountData, null, 2)}`);
      
      if (!req.userJwt) {
        throw new Error('Authentication required');
      }
      
      const savedAccount = await db.createAccountForUser(req.userJwt, accountData);
      await handler.disconnect();
      
      // Increment user's email account count for billing/limits tracking
      try {
        await SubscriptionService.incrementEmailAccountCount(req.user.id);
      } catch (error) {
        logger.error('Error incrementing email account count:', error);
        // Don't fail the request if this fails
      }

      res.status(201).json({ 
        success: true, 
        message: `Account added successfully. ${folders.length} folders fetched.`,
        data: savedAccount,
        folderCount: folders.length
      });

    } catch (error: any) {
      logger.warn(`Connection test failed for ${email}: ${error.message}`);
      let errorMessage = error.message || 'Connection failed. Please check your credentials and server settings.';
      
      if (error.responseText) {
        errorMessage = error.responseText;
      } else if (error.serverResponseCode === 'AUTHENTICATIONFAILED' || 
                (error.response && error.response.includes('AUTHENTICATIONFAILED'))) {
        errorMessage = 'Invalid credentials';
      } else if (error.message && error.message.includes('Command failed') && error.response) {
        const match = error.response.match(/NO\s*\[?\w*\]?\s*(.+?)(?:\s*\(|$)/);
        if (match) {
          errorMessage = match[1].trim();
        }
      }
      
      return res.status(400).json({ 
        success: false,
        message: errorMessage
      });
    }
  } catch (error) {
    logger.error('Error in addEmailAccount controller:', error);
    next(error);
  }
};

export const listFolders = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const folders = await emailService.listFolders(accountId);
    res.status(200).json({
      success: true,
      data: folders,
    });
  } catch (error: any) {
    logger.error(`Error listing folders for account ${req.params.accountId}:`, error);
    res.status(500).json({
      success: false,
      error: error.text || error.message || 'Failed to list folders. Check server logs for details.',
    });
  }
};

export const listEmailAccounts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const accounts = await db.getAccountsForUser(req.userJwt);
    logger.info(`Fetched ${accounts.length} accounts for user ${req.user?.email}`);
    
    res.status(200).json({
      success: true,
      data: accounts,
      source: 'supabase'
    });
  } catch (error: any) {
    logger.error('Error listing email accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email accounts',
    });
  }
};

export const getEmailAccount = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const account = await db.getAccountById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Email account not found',
      });
    }
    
    logger.info(`Fetched account ${account.email} from ${FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION ? 'Supabase' : 'MongoDB'}`);
    
    res.status(200).json({
      success: true,
      data: account,
      source: FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION ? 'supabase' : 'mongodb'
    });
  } catch (error: any) {
    logger.error('Error getting email account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email account',
    });
  }
};

export const removeEmailAccount = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const success = await db.deleteAccount(accountId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    logger.info(`Email account ${accountId} removed successfully from ${FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION ? 'Supabase' : 'MongoDB'}`);

    res.status(200).json({
      success: true,
      message: 'Email account removed successfully',
      source: FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION ? 'supabase' : 'mongodb'
    });
  } catch (error: any) {
    logger.error('Error removing email account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove email account',
    });
  }
};

export const removeAllEmailAccounts = async (req: Request, res: Response) => {
  try {
    logger.warn('removeAllEmailAccounts called - not implemented for Supabase migration yet');
    
    res.status(501).json({
      success: false,
      error: 'Remove all accounts not implemented for Supabase migration - use individual account deletion for safety',
      source: FEATURE_FLAGS.USE_SUPABASE_ACCOUNTS || FEATURE_FLAGS.COMPLETE_MIGRATION ? 'supabase' : 'mongodb'
    });
  } catch (error: any) {
    logger.error('Error removing all email accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove all email accounts',
    });
  }
};

export const stopSync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { syncId } = req.body;
    
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!syncId) {
      return res.status(400).json({
        success: false,
        error: 'syncId is required',
      });
    }

    logger.info(`Attempting to stop sync job: ${syncId}`);
    
    // Get the job from database to verify user ownership and get BullMQ job ID
    const jobs = await db.getJobsForUser(req.userJwt);
    const job = jobs.find(j => j.id === syncId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or you do not have access to it',
      });
    }

    if (job.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel job with status: ${job.status}`,
      });
    }

    // Cancel the queue job if we have the job ID
    if (job.bullmq_job_id) {
      try {
        const userId = req.user?.id;
        if (!userId) {
          throw new Error('User not authenticated');
        }
        const userQueue = queueManager.getQueueForUser(userId);
        
        logger.info(`Attempting to cancel BullMQ job ${job.bullmq_job_id} from user queue ${userId}`);
        
        // Properly await the getJob call
        const queueJob = await userQueue.getJob(job.bullmq_job_id);
        if (queueJob) {
          // Try different cancellation methods
          try {
            await queueJob.remove();
            logger.info(`Successfully removed queue job ${job.bullmq_job_id}`);
          } catch (removeError) {
            logger.warn(`Failed to remove queue job ${job.bullmq_job_id}:`, removeError);
            // For the simple queue system, if remove fails the job will eventually complete or timeout
            // The database status update below will handle the cancellation state
          }
        } else {
          logger.warn(`Queue job ${job.bullmq_job_id} not found in queue - may have already completed`);
        }
      } catch (queueError) {
        logger.error(`Error cancelling BullMQ job ${job.bullmq_job_id}:`, queueError);
        // Continue with database update even if queue removal fails
      }
    }

    // Update the job status in the database
    await db.updateSyncJob(syncId, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error: 'Job cancelled by user'
    } as any);

    // Update account status back to connected
    if (job.account_id) {
      await db.updateAccount(job.account_id, { status: 'connected' });
      
      // Broadcast the account status update
      await supabaseRealtime.broadcastEmailAccountUpdate({
        id: job.account_id,
        status: 'connected',
        error_message: ''
      });
    }

    logger.info(`Successfully stopped sync job: ${syncId}`);
    
    res.status(200).json({
      success: true,
      message: 'Sync job cancelled successfully',
    });
  } catch (error: any) {
    logger.error('Error stopping sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop sync',
      details: error.message
    });
  }
};

export const listSyncJobs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const jobs = await db.getJobsForUser(req.userJwt);
    const { accountId } = req.query;
    
    // Filter by accountId if provided
    const filteredJobs = accountId ? jobs.filter(job => job.account_id === accountId) : jobs;
    
    res.status(200).json({ success: true, data: filteredJobs });
  } catch (error: any) {
    logger.error('Error listing email jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to list email jobs' 
    });
  }
};

export const deleteSyncJob = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { syncJobId } = req.params;
    
    // Use user-scoped delete method (RLS will automatically filter by user)
    await db.deleteJobForUser(req.userJwt, syncJobId);
    
    res.status(200).json({ 
      success: true, 
      message: 'Job and associated emails deleted successfully' 
    });
  } catch (error: any) {
    logger.error('Error deleting job:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete job' 
    });
  }
};

export const deleteAllSyncJobs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Use user-scoped delete method (RLS will automatically filter by user)
    await db.deleteAllJobsForUser(req.userJwt);
    
    res.status(200).json({ 
      success: true, 
      message: 'All jobs and emails have been deleted' 
    });
  } catch (error: any) {
    logger.error('Error deleting all jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete all jobs' 
    });
  }
};

export const getExtractedEmails = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { limit = 100 } = req.query;
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }
    
    // Get emails for this account
    const emails = await db.getAccountEmails(accountId as string);
    
    res.status(200).json({
      success: true,
      data: emails
    });
  } catch (error: any) {
    logger.error('Error getting extracted emails:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get extracted emails'
    });
  }
};

export const getSyncJobResults = async (req: Request, res: Response) => {
  try {
    const { syncJobId } = req.params;
    
    // Get emails for this job
    const emails = await db.getJobEmails(syncJobId);
    
    res.status(200).json({ 
      success: true, 
      data: { 
        status: 'completed',
        results: emails,
        count: emails.length,
        syncJobId
      } 
    });
  } catch (error: any) {
    logger.error('Error getting job results:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get job results' 
    });
  }
};

export const exportEmails = async (req: Request, res: Response) => {
  try {
    const { accountId, format } = req.body;
    
    // Start export process
    const exportId = `export-${Date.now()}`;
    logger.info(`Exporting emails for account ${accountId} in ${format} format`);
    
    res.status(202).json({
      success: true,
      data: {
        exportId,
        status: 'processing',
        downloadUrl: `/api/exports/${exportId}/download`,
      },
    });
  } catch (error: any) {
    logger.error('Error exporting emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export emails',
    });
  }
};

export const cancelBulkOperations = async (req: Request, res: Response) => {
  try {
    const { operationIds } = req.body;
    
    if (!operationIds || !Array.isArray(operationIds)) {
      return res.status(400).json({ 
        success: false, 
        message: 'operationIds array is required' 
      });
    }

    const results = await Promise.all(
      operationIds.map(async (opId: string) => {
        try {
          const cancelled = await cancellationService.cancelOperation(opId);
          return { operationId: opId, success: cancelled };
        } catch (error) {
          logger.error(`Error cancelling operation ${opId}:`, error);
          return { operationId: opId, success: false, error: (error as Error).message };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    res.json({
      success: true,
      message: `Successfully cancelled ${successful} of ${operationIds.length} operations`,
      results
    });
  } catch (error) {
    logger.error('Error in cancelBulkOperations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel operations',
      error: (error as Error).message
    });
  }
};

export const startSync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, folders, name, since, proxyId } = req.body;

    // Log incoming folders for debugging
    logger.info(`[startSync] Received folders: ${JSON.stringify(folders)} (type: ${Array.isArray(folders) ? 'array' : typeof folders}, length: ${folders?.length})`);

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId is required'
      });
    }

    // Validate folders is an array if provided
    if (folders && !Array.isArray(folders)) {
      return res.status(400).json({
        success: false,
        message: 'folders must be an array'
      });
    }

    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Get the user's accounts (this will automatically filter by user due to RLS)
    const accounts = await databaseAdapter.getAccountsForUser(req.userJwt);
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        message: 'Account not found or you do not have access to it' 
      });
    }

    // Create a new sync job using the database adapter
    // Using the actual schema from the migration file
    const syncJob = {
      id: uuidv4(),
      account_id: accountId,
      status: 'running',  // Default status in the schema is 'running'
      created_at: new Date().toISOString(),
      completed_at: null
    };
    
    // Add optional fields if they exist in the request
    // These will be stored in the job data, not in the email_jobs table
    const jobData = {
      name: name || `Sync for ${account.email}`,
      folders: folders || [],
      since: since || null
    };
    
    // Insert the new job into the database using user-scoped method
    const createdJob = await databaseAdapter.createJobForUser(req.userJwt, syncJob);

    // Get the proxy information - prioritize proxyId from request, fallback to account's proxy
    let proxy = null;
    const proxies = await db.getProxiesForUser(req.userJwt);
    
    if (proxyId) {
      // Use proxy from request
      proxy = proxies.find(p => p.id === proxyId);
      if (!proxy) {
        return res.status(400).json({ 
          success: false, 
          message: 'Selected proxy not found or you do not have access to it' 
        });
      }
    } else if ('proxy_id' in account && account.proxy_id) {
      // Fallback to account's proxy_id
      proxy = proxies.find(p => p.id === account.proxy_id);
    } else if ('proxy' in account && account.proxy) {
      // MongoDB-style account with populated proxy
      proxy = account.proxy;
    }

    // Prepare job data with explicit fields to avoid duplicates
    const jobPayload = {
      accountId,
      syncJobId: syncJob.id,
      name: jobData.name,
      since: jobData.since,
      folders: (folders && folders.length > 0) ? folders : ['INBOX'], // Default to INBOX if no folders specified
      proxy // Include proxy information
    };

    // Log final folders being sent to queue
    logger.info(`[startSync] Adding job to queue with folders: ${JSON.stringify(jobPayload.folders)}`);

    // Get user-specific queue and add the job
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const userQueue = queueManager.getQueueForUser(userId);
    const queueJob = await userQueue.add('sync-email', jobPayload, { userId });
    
    // Update the job record with the BullMQ job ID so we can cancel it later
    await db.updateSyncJob(syncJob.id, { 
      bullmq_job_id: queueJob.id,
      started_at: new Date().toISOString()
    } as any);
    
    logger.info(`Started sync job ${syncJob.id} (BullMQ ID: ${queueJob.id}) for account ${account.email} with ${folders?.length || 1} folders`);

    res.json({
      success: true,
      message: 'Sync job started',
      syncJobId: syncJob.id,
      queueJobId: queueJob.id
    });
  } catch (error) {
    logger.error('Error in startSync:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start sync',
      error: (error as Error).message
    });
  }
};

export const autoDetectSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, proxyId, operationId } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Create abort controller for cancellation support
    const abortController = new AbortController();
    const finalOperationId = operationId || `auto-detect-${email}-${Date.now()}`;
    
    // Register this operation as cancellable
    cancellationService.registerOperation(
      finalOperationId,
      'auto-detect',
      email,
      abortController
    );
    
    if (!validateEmailFormat(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }
    
    logger.info(`Auto-detecting settings for ${email}...`);
    
    // Fetch proxy if provided
    let proxy: { host: string; port: number; type: 'SOCKS5' | 'HTTP'; userId?: string; password?: string; } | undefined = undefined;
    if (proxyId && proxyId !== 'no-proxy') {
      try {
        const proxyData = await databaseAdapter.getProxyById(proxyId);
        if (proxyData) {
          logger.info(`Using proxy: ${proxyData.host}:${proxyData.port} (${proxyData.type})`);
          // Convert to format expected by auto-detection service
          proxy = {
            host: proxyData.host,
            port: proxyData.port,
            type: proxyData.type,
            userId: proxyData.user_id,
            password: proxyData.password,
          };
        }
      } catch (error) {
        logger.warn(`Failed to fetch proxy ${proxyId}:`, error);
      }
    }
    
    // Perform auto-detection with cancellation support
    let result: any;
    try {
      // Check if operation was cancelled before starting
      if (abortController.signal.aborted) {
        logger.info(`🛑 Auto-detection cancelled before starting for ${email}`);
        res.status(400).json({
          success: false,
          error: 'Operation was cancelled',
        });
        return;
      }

      // Call optimized auto-detection service with abort signal
      result = await autoDetectEmailSettings({
        email,
        password,
        timeout: 5000,  // 5 second timeout per test (faster)
        maxAttempts: 3,  // Test only 3 configurations (faster for bulk)
        proxy,
        abortSignal: abortController.signal,
      });
    } catch (error: any) {
      // Check if this was a cancellation
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        logger.info(`🛑 Auto-detection cancelled for ${email}`);
        res.status(400).json({
          success: false,
          error: 'Operation was cancelled',
        });
        return;
      }
      throw error; // Re-throw non-cancellation errors
    } finally {
      // Always cleanup the operation
      cancellationService.unregisterOperation(finalOperationId);
    }
    
    // Check if auto-detection was successful
    if (result.success && result.data) {
      const detectedData = result.data;
      logger.info(`✅ Auto-detection successful for ${email}: ${detectedData.provider.type} ${detectedData.provider.host}:${detectedData.provider.port}`);
      
      // Extract provider information safely
      let providerName: string;
      let providerType: string;
      let host: string;
      let port: number;
      let secure: boolean;
      
      if (typeof detectedData.provider === 'object' && detectedData.provider !== null) {
        // New format: result.data with nested provider object
        providerName = detectedData.provider.type || 'Unknown Provider';
        providerType = detectedData.provider.type || 'IMAP';
        host = detectedData.provider.host || '';
        port = detectedData.provider.port || 993;
        secure = detectedData.provider.secure || true;
      } else {
        // Old format: result.settings with flat structure
        providerName = (detectedData as any).provider || 'Unknown Provider';
        providerType = (detectedData as any).type || 'IMAP';
        host = (detectedData as any).host || '';
        port = (detectedData as any).port || 993;
        secure = (detectedData as any).secure || true;
      }
      
      const username = (detectedData as any).auth?.user || (detectedData as any).username || email;
      
      // Convert detected settings to the format expected by the frontend
      const detectedConfig = {
        email: detectedData.email,
        provider: {
          name: providerName,
          type: providerType,
          host: host,
          port: port,
          secure: secure,
        },
        auth: {
          user: username,
          // Password omitted for security
        },
        testedConfigurations: result.testedConfigurations,
      };
      
      res.status(200).json({
        success: true,
        message: `Settings auto-detected using ${providerName}`,
        data: {
          ...detectedConfig,
          auth: {
            user: username,
            // Password omitted for security
          },
        },
        meta: {
          providerName: getProviderDisplayName(email),
          testedConfigurations: result.testedConfigurations,
        },
      });
    } else {
      logger.warn(`❌ Auto-detection failed for ${email}: ${result.error}`);
      
      res.status(400).json({
        success: false,
        error: result.error || 'Unable to auto-detect email settings',
        meta: {
          providerName: getProviderDisplayName(email),
          testedConfigurations: result.testedConfigurations,
        },
      });
    }
  } catch (error: any) {
    logger.error('Auto-detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Auto-detection service error',
    });
  }
};
