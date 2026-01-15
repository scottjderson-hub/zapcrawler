import { BaseProtocolHandler } from './base';
import { EmailFolder, EmailMessage, SyncOptions } from '../../types/email';
import { logger } from '../../utils/logger';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface Office365OAuthAuth {
  type: 'office365_oauth' | 'outlook_oauth';
  accessToken: string;
  refreshToken?: string;
  expiresOn: string;
  email: string;
  proxy?: {
    host: string;
    port: number;
    type: number | string; // 4 for SOCKS4, 5 for SOCKS5, 1 for HTTP
    userId?: string;
    password?: string;
  };
}

export class Office365OAuthHandler extends BaseProtocolHandler {
  private httpClient: AxiosInstance | null = null;
  private auth: Office365OAuthAuth | null = null;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests
  private readonly MAX_RETRIES = 5;

  constructor() {
    super();
  }

  /**
   * Rate limit helper - adds delay between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;

    // Add longer delay every 100 requests to avoid throttling
    if (this.requestCount % 100 === 0) {
      logger.debug(`Rate limiting: Adding 2s delay after ${this.requestCount} requests`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    retryCount: number = 0
  ): Promise<T> {
    try {
      await this.rateLimit();
      return await operation();
    } catch (error: any) {
      const status = error.response?.status;
      const retryAfter = error.response?.headers?.['retry-after'];

      // Check if it's a throttling error (429) or server error (5xx)
      if ((status === 429 || status >= 500) && retryCount < this.MAX_RETRIES) {
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s

        logger.warn(`⚠️ ${context}: ${status === 429 ? 'Rate limited' : 'Server error'} (attempt ${retryCount + 1}/${this.MAX_RETRIES}). Retrying in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(operation, context, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Connect using Office365 OAuth tokens
   */
  async connect(auth: any): Promise<boolean> {
    return this.testConnection(auth);
  }

  /**
   * Test connection by validating access token with Graph API
   */
  async testConnection(auth: any): Promise<boolean> {
    try {
      logger.info('🔍 Office365 OAuth: Starting testConnection');
      logger.info('🔍 Auth object structure:', {
        hasAuth: !!auth,
        hasAccessToken: !!auth?.accessToken,
        hasRefreshToken: !!auth?.refreshToken,
        hasProxy: !!auth?.proxy,
        proxyHost: auth?.proxy?.host,
        email: auth?.email,
        expiresOn: auth?.expiresOn
      });

      // Validate required fields
      if (!auth.accessToken) {
        throw new Error('Access token is required for OAuth authentication');
      }

      if (!auth.email) {
        throw new Error('Email address is required for OAuth authentication');
      }

      // Check if token is expired
      if (auth.expiresOn) {
        const expiryDate = new Date(auth.expiresOn);
        const now = new Date();
        const buffer = 5 * 60 * 1000; // 5 minute buffer

        if (expiryDate.getTime() <= (now.getTime() + buffer)) {
          logger.warn('⚠️ Access token is expired or expiring soon');
          // In a full implementation, you would refresh the token here
          throw new Error('Access token is expired. Please re-authenticate.');
        }
      }

      this.auth = auth;
      this.httpClient = this.createHttpClient(auth.proxy);

      logger.info('🔍 Testing access token with Graph API...');

      // Test access token with Graph API
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data.userPrincipalName) {
        this.connected = true;
        logger.info(`✅ Office365 OAuth authentication successful for ${auth.email}`);
        return true;
      } else {
        logger.error('❌ Invalid response from Graph API');
        return false;
      }

    } catch (error: any) {
      logger.error('❌ Office365 OAuth authentication failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      this.connected = false;
      return false;
    }
  }

  /**
   * Get email folders using Graph API
   */
  async getFolders(): Promise<EmailFolder[]> {
    if (!this.connected || !this.auth?.accessToken) {
      throw new Error('Not connected to Office365. OAuth authentication failed - please check access token.');
    }

    logger.info('🔍 Office365 OAuth: Getting folders via Graph API...');

    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${this.auth.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data.value) {
        const folders = response.data.value.map((folder: any) => ({
          name: folder.displayName,
          path: folder.id,
          delimiter: '/',
          flags: [],
          specialUse: this.getSpecialUseFlags(folder.displayName),
          messages: folder.totalItemCount || 0,
          unseen: folder.unreadItemCount || 0,
        }));

        logger.info(`✅ Retrieved ${folders.length} folders from Graph API`);
        return this.normalizeFolders(folders);
      } else {
        throw new Error('Invalid response from Graph API');
      }

    } catch (error: any) {
      const errorMessage = error.response?.status === 401
        ? 'Access denied. This account may not have an Exchange Online mailbox or proper Mail permissions. Please ensure the account has Mail.Read permissions and an active mailbox.'
        : error.message;

      logger.error('❌ Failed to get folders from Graph API:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        data: error.response?.data
      });

      throw new Error(`Failed to get folders: ${errorMessage}`);
    }
  }

  /**
   * Sync messages from specified folders using Graph API
   */
  async* syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.connected || !this.auth?.accessToken) {
      throw new Error('Not connected to Office365. OAuth authentication failed - please check access token.');
    }

    logger.info('🔍 Office365 OAuth: Starting message sync via Graph API...');

    // Get all folders first to map names to IDs
    const folders = await this.getFolders();
    const folderMap = new Map(folders.map(f => [f.name.toLowerCase(), f.path]));

    // Process specified folders or default to inbox
    const foldersToSync = options.folders?.length ? options.folders : ['inbox'];

    for (const folderName of foldersToSync) {
      const folderId = folderMap.get(folderName.toLowerCase()) || folderName;
      logger.info(`🔍 Syncing folder: ${folderName} (ID: ${folderId})`);

      yield* this.syncFolder(folderId, folderName, options);
    }
  }

  /**
   * Sync messages from a specific folder using Graph API
   */
  private async* syncFolder(folderId: string, folderName: string, options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.auth?.accessToken) return;

    let nextLink: string | null = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`;
    let processed = 0;
    let pageCount = 0;

    // Add query parameters for Graph API
    const params = new URLSearchParams();
    // Increase batch size from 50 to 999 (Graph API maximum)
    params.append('$top', (options.batchSize || 999).toString());
    params.append('$orderby', 'receivedDateTime desc');
    // Reduce fields to only what we need for email extraction
    params.append('$select', 'id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,conversationId');

    if (options.since) {
      params.append('$filter', `receivedDateTime ge ${options.since.toISOString()}`);
    }

    nextLink += `?${params.toString()}`;

    while (nextLink) {
      try {
        pageCount++;
        logger.info(`🔍 Fetching page ${pageCount} from folder ${folderName}...`);

        // Use retry logic with exponential backoff
        const response: any = await this.retryWithBackoff(
          () => axios.get(nextLink!, {
            headers: {
              'Authorization': `Bearer ${this.auth!.accessToken}`,
              'Accept': 'application/json',
              'Prefer': 'odata.maxpagesize=999' // Request maximum page size
            },
            timeout: 60000 // 60 second timeout
          }),
          `Sync folder ${folderName} page ${pageCount}`
        );

        if (response.status !== 200 || !response.data.value) {
          logger.error('❌ Invalid response from Graph API');
          break;
        }

        const messages = response.data.value;
        logger.info(`📧 Retrieved ${messages.length} messages from folder ${folderName} (page ${pageCount}, total processed: ${processed})`);

        // Process messages and yield them one by one (memory efficient)
        for (const message of messages) {
          try {
            const emailMessage = this.convertGraphMessageToEmailMessage(message, folderName);
            processed++;

            // Update progress every 50 messages
            if (processed % 50 === 0) {
              this.emitProgress({
                processed,
                total: 0, // Graph API doesn't provide total count upfront
                folder: folderName,
                status: 'syncing'
              });
              logger.debug(`Progress: ${processed} messages processed from ${folderName}`);
            }

            yield emailMessage;

            // Force garbage collection hint every 1000 messages
            if (processed % 1000 === 0 && global.gc) {
              global.gc();
              logger.debug(`Memory: Suggested GC after ${processed} messages`);
            }

          } catch (error: any) {
            logger.warn(`⚠️ Skipping message due to conversion error: ${error.message}`);
          }
        }

        // Check for next page
        nextLink = response.data['@odata.nextLink'] || null;

        if (nextLink) {
          logger.debug(`Next page available, continuing... (${processed} total so far)`);
        }

      } catch (error: any) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        logger.error(`❌ Error syncing folder ${folderName} at page ${pageCount}:`, {
          message: error.message,
          status,
          errorData,
          processed
        });

        // If we've processed some messages, don't fail completely
        if (processed > 0) {
          logger.warn(`⚠️ Partial sync completed: ${processed} messages retrieved before error`);
          this.emitProgress({
            processed,
            total: processed,
            folder: folderName,
            status: 'completed',
            error: `Partial sync: ${error.message}`
          });
        } else {
          this.emitProgress({
            processed,
            total: 0,
            folder: folderName,
            status: 'error',
            error: error.message
          });
        }
        break;
      }
    }

    this.emitProgress({
      processed,
      total: processed,
      folder: folderName,
      status: 'completed'
    });

    logger.info(`✅ Completed syncing folder ${folderName}: ${processed} messages processed`);
  }

  /**
   * Get a specific message by ID using Graph API
   */
  async getMessage(messageId: string): Promise<EmailMessage> {
    if (!this.connected || !this.auth?.accessToken) {
      throw new Error('Not connected to Office365. OAuth authentication failed.');
    }

    try {
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.auth.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return this.convertGraphMessageToEmailMessage(response.data, 'unknown');
    } catch (error: any) {
      logger.error(`Error fetching Office365 message ${messageId}:`, error.message);
      throw new Error(`Failed to fetch message: ${error.message}`);
    }
  }

  /**
   * Create HTTP client with proxy support
   */
  private createHttpClient(proxy?: any): AxiosInstance {
    const config: any = {
      timeout: 30000,
      maxRedirects: 5,
    };

    // Configure proxy if provided
    if (proxy && proxy.host) {
      logger.info(`🔐 Office365 OAuth: Configuring proxy ${proxy.host}:${proxy.port} (type: ${proxy.type})`);

      try {
        if (proxy.type === 4 || proxy.type === 'SOCKS4') {
          const proxyUrl = `socks4://${proxy.host}:${proxy.port}`;
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else if (proxy.type === 5 || proxy.type === 'SOCKS5') {
          let proxyUrl = `socks5://${proxy.host}:${proxy.port}`;
          if (proxy.userId && proxy.password) {
            proxyUrl = `socks5://${proxy.userId}:${proxy.password}@${proxy.host}:${proxy.port}`;
          }
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else if (proxy.type === 1 || proxy.type === 'HTTP') {
          let proxyUrl = `http://${proxy.host}:${proxy.port}`;
          if (proxy.userId && proxy.password) {
            proxyUrl = `http://${proxy.userId}:${proxy.password}@${proxy.host}:${proxy.port}`;
          }
          config.httpsAgent = new HttpsProxyAgent(proxyUrl);
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (error) {
        logger.error('❌ Failed to configure proxy:', error);
      }
    }

    return axios.create(config);
  }

  /**
   * Convert Graph API message to EmailMessage format
   * Optimized for email extraction - only includes essential fields
   */
  private convertGraphMessageToEmailMessage(message: any, folderName: string): EmailMessage {
    return {
      id: message.id,
      threadId: message.conversationId,
      subject: message.subject || '',
      from: {
        name: message.from?.emailAddress?.name || '',
        address: message.from?.emailAddress?.address || ''
      },
      to: (message.toRecipients || []).map((recipient: any) => ({
        name: recipient.emailAddress?.name || '',
        address: recipient.emailAddress?.address || ''
      })),
      cc: (message.ccRecipients || []).map((recipient: any) => ({
        name: recipient.emailAddress?.name || '',
        address: recipient.emailAddress?.address || ''
      })),
      bcc: (message.bccRecipients || []).map((recipient: any) => ({
        name: recipient.emailAddress?.name || '',
        address: recipient.emailAddress?.address || ''
      })),
      date: new Date(message.receivedDateTime),
      body: '', // Don't fetch body content for performance
      folder: folderName
    };
  }

  /**
   * Map folder names to special use flags
   */
  private getSpecialUseFlags(folderName: string): string[] {
    const name = folderName.toLowerCase();

    if (name.includes('inbox')) return ['\\Inbox'];
    if (name.includes('sent')) return ['\\Sent'];
    if (name.includes('draft')) return ['\\Drafts'];
    if (name.includes('trash') || name.includes('deleted')) return ['\\Trash'];
    if (name.includes('junk') || name.includes('spam')) return ['\\Junk'];
    if (name.includes('archive')) return ['\\Archive'];

    return [];
  }
}