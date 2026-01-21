import { EventEmitter } from 'events';
import { ImapHandler } from './protocols/imap';
import { Pop3Handler } from './protocols/pop3';
import { ExchangeHandler } from './protocols/exchange';
import { Office365CookieHandler } from './protocols/office365Cookie';
import { Office365OAuthHandler } from './protocols/office365OAuth';
import { EmailMessage, SyncOptions, EmailFolder } from '../types/email';
// MongoDB models replaced with Supabase database adapter
// import EmailAccountModel, { IEmailAccount } from '../models/EmailAccount';
// import { Proxy } from '../models/Proxy';
// import SyncJobModel from '../models/SyncJob';
import { db } from '../adapters/databaseAdapter';
import { IEmailAccount } from '../models/EmailAccount'; // Keep interface for typing
import { logger } from '../utils/logger';
import { getMicrosoftOAuthService } from './microsoftOAuth';
import { TokenService } from './tokenService';

export class EmailService extends EventEmitter {

  private getProtocolHandler(provider: string): ImapHandler | Pop3Handler | ExchangeHandler | Office365CookieHandler | Office365OAuthHandler {
    switch (provider.toLowerCase()) {
      case 'imap':
      case 'gmail':
      case 'yahoo':
      case 'outlook': // Assuming Outlook uses IMAP
      case 'comcast':
        return new ImapHandler();
      case 'pop3':
        return new Pop3Handler();
      case 'exchange':
        return new ExchangeHandler();
      case 'office365_cookies':
        return new Office365CookieHandler();
      case 'office365':
      case 'office365_oauth':
      case 'outlook_oauth':
        return new Office365OAuthHandler();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async getFullAuth(account: any): Promise<any> {
    const startTime = Date.now();
    const logContext = `[getFullAuth] ${account?.email || 'unknown-account'}`;
    
    try {
      // Start with account auth data
      const fullAuth = { ...(account.auth || {}) };
      
      // Handle OAuth2 token refresh if needed
      if (fullAuth.accessToken && fullAuth.expiresOn) {
        const oauthService = getMicrosoftOAuthService();
        const expiresOn = new Date(fullAuth.expiresOn);
        
        // Check if token needs refresh (within 5 minutes of expiry)
        if (!oauthService.isTokenValid(expiresOn)) {
          logger.info(`${logContext} - Access token expired, attempting refresh`);
          
          if (fullAuth.refreshToken) {
            try {
              const refreshedTokens = await oauthService.refreshAccessToken(
                fullAuth.refreshToken, 
                account.email
              );
              
              fullAuth.accessToken = refreshedTokens.accessToken;
              fullAuth.refreshToken = refreshedTokens.refreshToken;
              fullAuth.expiresOn = refreshedTokens.expiresOn;
              
              // Update account in database with new tokens
              await db.updateAccount(account.id, { 
                auth: fullAuth 
              });
              
              logger.info(`${logContext} - Access token refreshed successfully`);
            } catch (refreshError) {
              logger.error(`${logContext} - Token refresh failed:`, refreshError);
              throw new Error('OAuth2 token refresh failed. Please re-authenticate.');
            }
          } else {
            throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
          }
        }
      }
      
      // If account has a proxy_id, use it to get the proxy configuration
      if (account.proxy_id) {
        try {
          logger.info(`${logContext} - Fetching proxy with ID: ${account.proxy_id}`);
          const proxy = await db.getProxyById(account.proxy_id);
          
          if (proxy) {
            // Map proxy type correctly for SOCKS library
            let proxyType = 5; // Default to SOCKS5
            const proxyTypeStr = proxy.type?.toUpperCase();
            if (proxyTypeStr === 'SOCKS4') {
              proxyType = 4;
            } else if (proxyTypeStr === 'HTTP') {
              proxyType = 1;
            }
            
            // Ensure userId is properly set for SOCKS5 authentication
            const userId = proxy.username || proxy.name || 'user';
            
            // Ensure password is a string and not truncated
            const password = String(proxy.password || '');
            logger.info(`${logContext} - Proxy password length: ${password.length}`);
            
            fullAuth.proxy = {
              host: proxy.host,
              port: proxy.port,
              type: proxyType,
              userId: userId,
              password: password
            };
            
            logger.info(`${logContext} - Using proxy: ${proxy.host}:${proxy.port} (${proxy.type})`);
          } else {
            logger.warn(`${logContext} - Proxy with ID ${account.proxy_id} not found in database`);
          }
        } catch (error) {
          logger.error(`${logContext} - Error fetching proxy:`, error);
          // Don't fail the operation if proxy fetch fails
        }
      } else {
        logger.info(`${logContext} - No proxy_id configured for this account`);
      }
      
      // Log the final auth config (without sensitive data)
      
      
      // Make a deep copy to ensure we don't pass any references to the logger's safe object
      const resultAuth = {
        ...fullAuth,
        proxy: fullAuth.proxy ? { ...fullAuth.proxy } : undefined
      };
      
      return resultAuth;
    } catch (error) {
      logger.error(`${logContext} - Error in getFullAuth:`, error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      logger.debug(`${logContext} - getFullAuth completed in ${duration}ms`);
    }
  }

  async listFolders(accountOrId: string | any): Promise<EmailFolder[]> {
    const account = typeof accountOrId === 'string' 
      ? await db.getAccountById(accountOrId)
      : accountOrId;
      
    if (!account) {
      const error = new Error('Account not found');
      logger.error(error.message, { accountId: typeof accountOrId === 'string' ? accountOrId : 'n/a' });
      throw error;
    }
    
    // Get proxy if needed - handle both MongoDB and Supabase structures
    let proxy = null;
    if ('proxy' in account && account.proxy) {
      // MongoDB case - proxy is a reference or populated object
      if (typeof account.proxy === 'string') {
        const proxies = await db.getProxies();
        proxy = proxies.find(p => p.id === account.proxy);
      } else {
        // Already populated proxy object
        proxy = account.proxy;
      }
    } else if ('proxy_id' in account && account.proxy_id) {
      // Supabase case - proxy_id is a UUID string
      const proxies = await db.getProxies();
      proxy = proxies.find(p => p.id === account.proxy_id);
    }

    const { provider } = account;
    if (provider.toLowerCase() === 'pop3') {
      logger.info('POP3 account selected for folder listing. Returning INBOX as POP3 does not support folders.');
      return new Pop3Handler().getFolders();
    }

    // Check if folders are already stored in the account (from account creation)
    if (account.folders && Array.isArray(account.folders) && account.folders.length > 0) {
      logger.info(`Returning ${account.folders.length} stored folders for ${account.email} (no IMAP connection needed)`);
      return account.folders;
    }

    // Fallback: If no stored folders, connect and fetch them (should rarely happen)
    logger.warn(`No stored folders found for ${account.email}, connecting to IMAP to fetch folders`);
    const handler = this.getProtocolHandler(provider) as ImapHandler | ExchangeHandler;

    try {
      logger.info(`Attempting to connect to ${account.email} via ${provider.toUpperCase()}`);
      const fullAuth = await this.getFullAuth(account);
      await handler.connect(fullAuth as any);
      const folders = await handler.getFolders();
      
      // Store the fetched folders in the database for future use
      if (!account.id) {
        logger.warn(`Cannot update folders: Account ID is missing for ${account.email}`);
      } else {
        await db.updateAccount(account.id, { folders });
        logger.info(`Fetched and stored ${folders.length} folders for ${account.email}`);
      }
      
      return folders;
    } catch (error) {
      logger.error(`Failed to list folders for ${account.email}:`, error);
      throw error;
    } finally {
      await handler.disconnect();
    }
  }
  
  async testConnection(provider: string, auth: any, proxyId?: string, userId?: string): Promise<boolean> {
    const logContext = `[testConnection] ${provider}`;
    logger.info(`${logContext} - Testing connection with proxy: ${proxyId || 'none'}`);
    
    // Check token balance before proceeding (if userId provided)
    if (userId) {
      const balanceCheck = await TokenService.checkTokenBalance(userId, 'CONNECTION_TEST');
      if (!balanceCheck.hasEnoughTokens) {
        logger.warn(`${logContext} - Insufficient tokens for user ${userId}. Required: ${balanceCheck.requiredTokens}, Available: ${balanceCheck.currentBalance}`);
        throw new Error(`Insufficient tokens for connection test. Required: ${balanceCheck.requiredTokens}, Available: ${balanceCheck.currentBalance}`);
      }
    }
    
    let fullAuth = { ...auth };
    
    if (proxyId) {
      try {
        const proxies = await db.getProxies();
        const proxy = proxies.find(p => p.id === proxyId);
        
        if (proxy) {
          const proxyType = proxy.type === 'SOCKS5' ? 5 : 1;
          fullAuth.proxy = {
            host: proxy.host,
            port: proxy.port,
            userId: proxy.username || proxy.name || 'user',
            password: proxy.password ? '***' + proxy.password.slice(-3) : 'none',
            type: proxyType,
          };
          
          logger.info(`${logContext} - Using proxy: ${proxy.host}:${proxy.port} (${proxy.type})`);
        } else {
          logger.warn(`${logContext} - Proxy ID ${proxyId} not found`);
        }
      } catch (error) {
        logger.error(`${logContext} - Error getting proxy:`, error);
        throw new Error('Failed to get proxy configuration');
      }
    }
    const handler = this.getProtocolHandler(provider);
    try {
      const isConnected = await handler.testConnection(fullAuth as any);
      
      // Deduct tokens after successful connection test (if userId provided)
      if (userId && isConnected) {
        const deductionSuccess = await TokenService.deductTokens(
          userId,
          'CONNECTION_TEST',
          `Connection test for ${provider} account`,
          undefined,
          undefined
        );
        
        if (!deductionSuccess) {
          logger.warn(`${logContext} - Failed to deduct tokens for user ${userId} after successful connection test`);
          // Don't throw error here as the connection test was successful
        } else {
          logger.info(`${logContext} - Successfully deducted ${TokenService.ACTION_COSTS.CONNECTION_TEST} tokens for user ${userId}`);
        }
      }
      
      return isConnected;
    } catch (error: any) {
      logger.error(`Connection test failed for ${provider}:`, error);
      throw error; // Re-throw the original error
    }
  }

  async connectAndFetchFolders(email: string, provider: string, auth: any, proxy?: any): Promise<{ folders: EmailFolder[], handler: ImapHandler | Pop3Handler | ExchangeHandler | Office365CookieHandler | Office365OAuthHandler }> {
    const handler = this.getProtocolHandler(provider);
    try {
      // Debug: Log the original auth object structure
      logger.info('Original auth object:', JSON.stringify(auth, null, 2));
      
      // The proxy object from the frontend needs to be combined with auth
      let fullAuth = { ...auth };
      if (proxy) {
        // Map proxy type correctly for SOCKS library
        let proxyType = 5; // Default to SOCKS5
        if (proxy.type === 'SOCKS4') {
          proxyType = 4;
        } else if (proxy.type === 'SOCKS5') {
          proxyType = 5;
        } else if (proxy.type === 'HTTP') {
          proxyType = 1;
        }
        
        // Ensure userId is properly set for SOCKS5 authentication
        const userId = proxy.username || proxy.name || 'user'; // Use username, not user_id
        
        fullAuth.proxy = {
          host: proxy.host,
          port: proxy.port,
          type: proxyType,
          userId: userId,
          password: proxy.password,
        };
        
        logger.info(`[connectAndFetchFolders] Mapped proxy type '${proxy.type}' to SOCKS type ${proxyType}`);
        logger.info(`[connectAndFetchFolders] Proxy credentials: userId='${userId}', password length=${proxy.password?.length || 0}`);
      }
      
      // Handle Exchange-specific credential mapping
      if (provider.toLowerCase() === 'exchange') {
        // Validate required credentials before mapping
        if (!fullAuth.user && !email) {
          throw new Error('Exchange connection requires username/email');
        }
        if (!fullAuth.pass) {
          throw new Error('Exchange connection requires password');
        }
        if (!fullAuth.host) {
          throw new Error('Exchange connection requires host/server');
        }
        
        // Exchange handler expects different credential format
        const exchangeAuth = {
          username: fullAuth.user || email, // Map 'user' to 'username'
          password: fullAuth.pass, // Map 'pass' to 'password'
          host: fullAuth.host.startsWith('http') ? fullAuth.host : `https://${fullAuth.host}/EWS/Exchange.asmx`, // Ensure full EWS URL
          proxy: fullAuth.proxy // Preserve proxy if present
        };
        
        logger.info('Exchange auth validation passed. Credentials:', {
          username: exchangeAuth.username,
          password: exchangeAuth.password ? '[SET]' : '[MISSING]',
          host: exchangeAuth.host,
          hasProxy: !!exchangeAuth.proxy
        });
        
        await handler.connect(exchangeAuth);
      } else {
        // Debug: Log the final auth object being passed to handler
        logger.info('Final auth object passed to handler (provider: ' + provider + '):', JSON.stringify({
          ...fullAuth,
          pass: '[REDACTED]',
          cookies: fullAuth.cookies ? `[${fullAuth.cookies.length} cookies]` : undefined
        }, null, 2));

        // Special handling for Office365 cookies
        if (provider.toLowerCase() === 'office365_cookies') {
          logger.info('🔍 Office365 cookies - detailed auth structure:', {
            hasType: !!fullAuth.type,
            type: fullAuth.type,
            hasCookies: !!fullAuth.cookies,
            cookiesLength: fullAuth.cookies?.length || 0,
            hasProxy: !!fullAuth.proxy,
            proxyType: fullAuth.proxy?.type,
            proxyHost: fullAuth.proxy?.host
          });
        }

        await handler.connect(fullAuth);
      }
      
      // Forward folder progress events from handler to service
      handler.on('folderProgress', (progress) => {
        this.emit('folderProgress', { email, ...progress });
      });
      
      const folders = await handler.getFolders();
      // Return both folders and the handler so the controller can disconnect it
      return { folders, handler };
    } catch (error) {
      logger.error(`Failed to connect and fetch folders for ${email}:`, error);
      // Ensure we attempt to disconnect if the handler was created and is usable
      if (handler && handler.connected) {
        await handler.disconnect();
      }
      throw error; // Re-throw the error to be caught by the controller
    }
  }

  async syncFolders(syncJobId: string, account: any, folders: string[] = [], proxy?: any, userId?: string): Promise<void> {
    const startTime = Date.now();
    const logContext = `[syncFolders] ${account?.email || 'unknown-account'}`;
    
    // Log the start of sync with all relevant details
    logger.info(`${logContext} - Starting sync job ${syncJobId}`, {
      accountId: account?.id,
      email: account?.email,
      provider: account?.provider,
      proxyId: account?.proxy_id || 'none',
      requestedFolders: folders,
      hasFolders: Array.isArray(account?.folders) ? account.folders.length : 0,
      timestamp: new Date().toISOString()
    });
    
    if (!account) {
      const error = new Error(`Account not found for sync job ${syncJobId}`);
      logger.error(`${logContext} - ${error.message}`);
      throw error;
    }
    
    // Get proxy from parameter first, or fall back to account's proxy_id
    let proxyToUse = proxy; // Use the proxy passed as parameter first
    
    if (!proxyToUse && account.proxy_id) {
      // Fall back to fetching proxy details using the proxy_id from the account
      const proxies = await db.getProxies();
      proxyToUse = proxies.find(p => p.id === account.proxy_id);
      
      if (proxyToUse) {
        logger.info(`${logContext} - Using proxy from account's proxy_id: ${proxyToUse.host}:${proxyToUse.port} (${proxyToUse.type})`);
      } else {
        logger.warn(`${logContext} - Proxy with ID ${account.proxy_id} not found in database`);
      }
    } else if (proxyToUse) {
      logger.info(`${logContext} - Using proxy from job parameter: ${proxyToUse.host}:${proxyToUse.port} (${proxyToUse.type})`);
    } else {
      logger.warn(`${logContext} - No proxy configured for this account, using direct connection`);
    }
    
    // Log account structure for debugging (without sensitive data)
    const safeAccount = { ...account };
    if (safeAccount.auth) safeAccount.auth = { ...safeAccount.auth, pass: '[REDACTED]' };
    if (safeAccount.proxy) safeAccount.proxy = { ...safeAccount.proxy, password: '[REDACTED]' };
    
    logger.info(`[syncFolders] Account details: email=${account.email}, id=${account.id}`);
    logger.info(`[syncFolders] Account proxy_id: ${account.proxy_id || 'none'}`);
    logger.info(`[syncFolders] Account structure: ${JSON.stringify(safeAccount, null, 2)}`);

    // Handle different account types (MongoDB vs Supabase)
    // Extract provider safely from either account type
    const provider = account.provider?.toLowerCase() || 'imap';
    const handler = this.getProtocolHandler(provider);
    
    // Get full auth with proxy information
    const fullAuth = await this.getFullAuth(account);
    
    // If we have a proxy from the job parameter, override the account's proxy
    if (proxyToUse) {
      // Map proxy type correctly for SOCKS library
      let proxyType = 5; // Default to SOCKS5
      const proxyTypeStr = proxyToUse.type?.toUpperCase();
      if (proxyTypeStr === 'SOCKS4') {
        proxyType = 4;
      } else if (proxyTypeStr === 'HTTP') {
        proxyType = 1;
      }
      
      // Override fullAuth proxy with the job-specific proxy
      fullAuth.proxy = {
        host: proxyToUse.host,
        port: proxyToUse.port,
        type: proxyType,
        userId: proxyToUse.username || proxyToUse.name || 'user', // Use username, not user_id
        password: proxyToUse.password
      };
      
      logger.info(`${logContext} - Overriding auth proxy with job-specific proxy: ${proxyToUse.host}:${proxyToUse.port}`);
    }
    
    // Debug: Log proxy usage for sync jobs
    if (proxyToUse) {
      logger.info(`[syncFolders] Using proxy for sync job ${syncJobId}: ${proxyToUse.host}:${proxyToUse.port} (${proxyToUse.type})`);
    } else {
      logger.warn(`[syncFolders] No proxy configured for sync job ${syncJobId} - direct connection will be used`);
    }
    
    // Debug: Log if proxy is included in fullAuth
    if (fullAuth.proxy) {
      logger.info(`[syncFolders] Proxy included in fullAuth: ${fullAuth.proxy.host}:${fullAuth.proxy.port}`);
    } else {
      logger.warn(`[syncFolders] No proxy in fullAuth - connection will be direct`);
    }
    
    const allMessages: EmailMessage[] = [];

    // Import Supabase real-time service for updates
    const { supabaseRealtime } = await import('./supabaseRealtime');

    try {
      logger.info(`[syncFolders] About to connect using handler for provider: ${provider}`);
      
      // Listen for progress events from the handler and broadcast them via Supabase real-time
      handler.on('progress', (progress) => {
        logger.debug(`Sync progress for job ${syncJobId}:`, progress);
        supabaseRealtime.broadcastSyncProgress(syncJobId, progress.percentage || 0, userId || account.user_id || 'unknown', progress.message);
      });
      
      logger.info(`[syncFolders] Attempting to connect with fullAuth for syncJobId: ${syncJobId}`);
      
      // Handle Exchange-specific credential mapping (same as connectAndFetchFolders)
      if (provider.toLowerCase() === 'exchange') {
        // Validate required credentials before mapping
        if (!fullAuth.user && !account.email) {
          throw new Error('Exchange sync requires username/email');
        }
        if (!fullAuth.pass) {
          throw new Error('Exchange sync requires password');
        }
        if (!fullAuth.host) {
          throw new Error('Exchange sync requires host/server');
        }
        
        // Exchange handler expects different credential format
        const exchangeAuth = {
          username: fullAuth.user || account.email,
          password: fullAuth.pass,
          host: fullAuth.host.startsWith('http') ? fullAuth.host : `https://${fullAuth.host}/EWS/Exchange.asmx`,
          proxy: fullAuth.proxy
        };
        
        logger.info('Exchange sync auth validation passed. Credentials:', {
          username: exchangeAuth.username,
          password: exchangeAuth.password ? '[SET]' : '[MISSING]',
          host: exchangeAuth.host,
          hasProxy: !!exchangeAuth.proxy
        });
        
        await handler.connect(exchangeAuth);
      } else {
        await handler.connect(fullAuth as any);
      }
      
      logger.info(`[syncFolders] Successfully connected for syncJobId: ${syncJobId}`);
      
      // Broadcast sync start via Supabase real-time
      await supabaseRealtime.broadcastSyncJobUpdate({
        id: syncJobId,
        status: 'running',
        progress: 0,
        message: `Started syncing ${folders.length} folders for ${account.email}`
      });
      
      await supabaseRealtime.broadcastNotification('info', `Sync started for ${account.email}`, userId || account.user_id || 'unknown', {
        syncJobId,
        accountId: account.id,
        folders,
        email: account.email
      });
      
      // Update job with total folders to process using database adapter
      await db.updateSyncJob(syncJobId, {
        total_folders: folders.length,
        processed_folders: 0,
        current_count: 0
      });

      // Note: POP3 handler ignores folder argument and syncs INBOX by default.
      const syncGenerator = handler.syncMessages({ folders });
      
      // Add timeout protection for the sync operation
      const SYNC_TIMEOUT = 8 * 60 * 1000; // 8 minutes timeout (leave 2 minutes for cleanup)
      const syncPromise = (async () => {
        for await (const message of syncGenerator) {
          allMessages.push(message);
          this.emit('message', { syncJobId, message });

          // Update job progress every 10 messages for efficiency
          if (allMessages.length % 10 === 0) {
            // Update job progress using database adapter
            await db.updateSyncJob(syncJobId, {
              current_count: allMessages.length
            });

            // Broadcast message count progress via Supabase real-time
            const progressPercentage = Math.min(95, (allMessages.length / 1000) * 100); // Estimate progress
            await supabaseRealtime.broadcastSyncProgress(syncJobId, progressPercentage, userId || account.user_id || 'unknown', `Processed ${allMessages.length} messages`);
          }
        }
      })();
      
      // Race between sync operation and timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Sync operation timed out after 8 minutes')), SYNC_TIMEOUT);
      });
      
      try {
        await Promise.race([syncPromise, timeoutPromise]);
        logger.info(`${logContext} - Sync completed successfully, processed ${allMessages.length} messages`);
      } catch (error: any) {
        if (error.message?.includes('timed out') || 
            error.message?.includes('Socket timeout') || 
            error.code === 'ETIMEOUT') {
          logger.warn(`${logContext} - Sync timed out (${error.message}), processed ${allMessages.length} messages so far`);
          // Don't throw timeout errors, just log them and continue with partial results
        } else {
          logger.error(`${logContext} - Sync failed with error:`, error);
          throw error; // Re-throw other errors
        }
      }

      // Update final message count using database adapter
      await db.updateSyncJob(syncJobId, {
        current_count: allMessages.length,
        processed_folders: folders.length
      });

      // Extract unique email addresses from all message fields (duplicates removed)
      const extractedEmails = [...new Set(
        allMessages.flatMap(message => {
          const emails: string[] = [];
          if (message.from?.address) emails.push(message.from.address);
          if (message.to) emails.push(...message.to.map(r => r.address).filter(Boolean));
          if (message.cc) emails.push(...(message.cc || []).map(r => r.address).filter(Boolean));
          if (message.bcc) emails.push(...(message.bcc || []).map(r => r.address).filter(Boolean));
          return emails;
        })
      )];

      logger.info(`Extracted ${extractedEmails.length} unique emails from ${allMessages.length} messages (duplicates removed)`);

      // Handle partial token deduction for unique emails (if userId provided)
      let tokensDeducted = 0;
      let tokensNeeded = 0;
      let availableTokens = 0;
      let visibleEmailCount = extractedEmails.length;

      if (userId && extractedEmails.length > 0) {
        // Check available token balance first
        const balanceCheck = await TokenService.checkTokenBalance(userId, 'EMAIL_FETCH');
        availableTokens = balanceCheck.currentBalance;
        tokensNeeded = extractedEmails.length;

        logger.info(`${logContext} - Token analysis: Need ${tokensNeeded}, Have ${availableTokens}`);

        if (availableTokens >= tokensNeeded) {
          // User has enough tokens for all emails
          const tokenDeductionSuccess = await TokenService.deductEmailFetchTokens(
            userId,
            extractedEmails.length,
            undefined, // Pass undefined instead of syncJobId to avoid FK constraint
            `Fetched ${extractedEmails.length} unique emails from ${account.email} (Job: ${syncJobId})`
          );

          if (tokenDeductionSuccess) {
            tokensDeducted = extractedEmails.length;
            visibleEmailCount = extractedEmails.length;
            logger.info(`${logContext} - Successfully deducted ${tokensDeducted} tokens for ${extractedEmails.length} unique emails for user ${userId}`);
          } else {
            logger.warn(`${logContext} - Failed to deduct ${extractedEmails.length} tokens for user ${userId}. Sync completed but tokens not charged.`);
          }
        } else if (availableTokens > 0) {
          // Partial token deduction - user can afford some emails
          const tokenDeductionSuccess = await TokenService.deductEmailFetchTokens(
            userId,
            availableTokens,
            undefined,
            `Partial fetch: ${availableTokens}/${extractedEmails.length} unique emails from ${account.email} (Job: ${syncJobId})`
          );

          if (tokenDeductionSuccess) {
            tokensDeducted = availableTokens;
            visibleEmailCount = availableTokens;
            logger.info(`${logContext} - Partial deduction: ${tokensDeducted} tokens for ${availableTokens}/${extractedEmails.length} emails for user ${userId}`);
          } else {
            logger.warn(`${logContext} - Failed partial deduction for user ${userId}. Showing all emails without charge.`);
            visibleEmailCount = extractedEmails.length;
          }
        } else {
          // No tokens available - don't deduct anything
          logger.warn(`${logContext} - No tokens available for user ${userId}. All emails will be masked.`);
          visibleEmailCount = 0;
        }
      } else if (userId) {
        logger.info(`${logContext} - No tokens deducted (user ID provided but no emails found)`);
      }

      // Update job with completion status and store emails directly in the job record
      await db.updateSyncJob(syncJobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_count: extractedEmails.length,
        current_count: allMessages.length,
        extracted_emails: extractedEmails,
        email_count: extractedEmails.length,
        // Store token info in the error field as JSON for now (until schema update)
        error: JSON.stringify({
          tokens_deducted: tokensDeducted,
          tokens_needed: tokensNeeded,
          tokens_available: availableTokens,
          visible_email_count: visibleEmailCount
        })
      });

      // Broadcast completion
      await supabaseRealtime.broadcastSyncProgress(
        syncJobId,
        100,
        userId || account.user_id || 'unknown',
        `Sync complete: ${extractedEmails.length} unique emails found`
      );

      // Broadcast sync completion via Supabase real-time
      await supabaseRealtime.broadcastSyncJobUpdate({
        id: syncJobId,
        status: 'completed',
        progress: 100,
        message: `Completed: Found ${extractedEmails.length} unique emails from ${allMessages.length} messages`
      });
      
      await supabaseRealtime.broadcastNotification('success', `Sync completed for ${account.email}`, userId || account.user_id || 'unknown', {
        syncJobId,
        accountId: account.id,
        uniqueEmailsCount: extractedEmails.length,
        email: account.email
      });

      logger.info(`Sync completed for job ${syncJobId}. Found ${extractedEmails.length} unique emails from ${allMessages.length} messages.`);
    } catch (error: any) {
      logger.error(`Sync failed for job ${syncJobId}:`, error);

      // Broadcast sync failure via Supabase real-time
      await supabaseRealtime.broadcastSyncJobUpdate({
        id: syncJobId,
        status: 'failed',
        progress: 0,
        error_message: error.message,
        message: `Sync failed: ${error.message}`
      });

      await supabaseRealtime.broadcastNotification('error', `Sync failed for ${account.email}`, userId || account.user_id || 'unknown', {
        syncJobId,
        accountId: account.id,
        error: error.message,
        email: account.email
      });

      // Update job with failure status using database adapter
      await db.updateSyncJob(syncJobId, {
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString()
      });

      // Re-throw the error so the worker can handle it properly
      throw error;
    } finally {
      await handler.disconnect();
    }
  }
}
