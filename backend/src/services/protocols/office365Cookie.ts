import { BaseProtocolHandler } from './base';
import { EmailFolder, EmailMessage, SyncOptions } from '../../types/email';
import { logger } from '../../utils/logger';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface Office365Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expirationDate?: number;
  httpOnly?: boolean;
  hostOnly?: boolean;
}

export interface Office365CookieAuth {
  type: 'office365_cookies';
  cookies: Office365Cookie[];
  email: string;
  proxy?: {
    host: string;
    port: number;
    type: number | string; // 4 for SOCKS4, 5 for SOCKS5, 1 for HTTP
    userId?: string;
    password?: string;
  };
}

export class Office365CookieHandler extends BaseProtocolHandler {
  private httpClient: AxiosInstance | null = null;
  private auth: Office365CookieAuth | null = null;
  private accessToken: string | null = null;
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
   * Connect using Office365 cookies (same as testConnection for this protocol)
   */
  async connect(auth: any): Promise<boolean> {
    return this.testConnection(auth);
  }

  /**
   * Test connection by using cookies to perform OAuth flow and get access token
   */
  async testConnection(auth: any): Promise<boolean> {
    try {
      logger.info('🔍 Office365 Cookie OAuth: Starting testConnection');
      logger.info('🔍 Auth object structure:', {
        hasAuth: !!auth,
        hasCookies: !!auth?.cookies,
        cookiesLength: auth?.cookies?.length || 0,
        hasProxy: !!auth?.proxy,
        proxyHost: auth?.proxy?.host,
        email: auth?.email
      });

      // Extract cookies from auth
      const cookies = auth.cookies || auth;
      const proxy = auth.proxy;

      // Validate cookies structure
      const validation = Office365CookieHandler.validateCookies(cookies);
      if (!validation.valid) {
        logger.error('❌ Cookie validation failed:', validation.error);
        throw new Error(`Cookie validation failed: ${validation.error}`);
      }

      this.auth = auth;
      this.httpClient = this.createHttpClient(cookies, proxy);

      // Perform cookie-assisted OAuth flow
      const accessToken = await this.performCookieAssistedOAuth();

      if (accessToken) {
        // Test the access token with Graph API
        const testResult = await this.testAccessToken(accessToken);
        if (testResult.success) {
          this.accessToken = accessToken;
          this.connected = true;
          logger.info(`✅ Office365 cookie OAuth successful for ${auth.email}`);
          return true;
        }
      }

      logger.error(`❌ Office365 cookie OAuth failed for ${auth.email}`);
      this.connected = false;
      return false;

    } catch (error: any) {
      logger.error('❌ Office365 cookie OAuth failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      this.connected = false;
      return false;
    }
  }

  /**
   * Perform OAuth flow using cookies to skip login
   */
  private async performCookieAssistedOAuth(): Promise<string | null> {
    try {
      logger.info('🔑 Starting cookie-assisted OAuth flow...');

      // OAuth configuration - these should be environment variables
      const clientId = process.env.MICROSOFT_CLIENT_ID || 'your-client-id';
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || 'your-client-secret';
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/auth/microsoft/callback';
      const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

      if (clientId === 'your-client-id') {
        throw new Error('Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI environment variables.');
      }

      // Step 1: Start OAuth authorization flow with cookies
      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite offline_access')}&` +
        `response_mode=query&` +
        `state=cookie_auth_${Date.now()}`;

      logger.info(`🔑 Step 1: Accessing authorization URL with cookies...`);

      const authResponse = await this.httpClient!.get(authUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });

      logger.info(`🔑 Auth response: ${authResponse.status} ${authResponse.statusText}`);

      // Check if we got redirected back with authorization code (auto-consent)
      if (authResponse.status === 302 && authResponse.headers.location) {
        const location = authResponse.headers.location;
        const codeMatch = location.match(/code=([^&]+)/);

        if (codeMatch) {
          const authCode = codeMatch[1];
          logger.info('🔑 Step 2: Got authorization code, exchanging for access token...');

          // Step 2: Exchange authorization code for access token
          const tokenResponse = await this.httpClient!.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code: authCode,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );

          if (tokenResponse.status === 200 && tokenResponse.data.access_token) {
            logger.info('✅ Successfully obtained access token via cookie-assisted OAuth');
            return tokenResponse.data.access_token;
          }
        }
      }

      // If we get here, we need to handle the consent page
      logger.info('🔑 Checking for consent page...');
      const responseText = typeof authResponse.data === 'string' ? authResponse.data : '';

      // Look for consent form
      if (responseText.includes('consent') || responseText.includes('permissions')) {
        logger.info('🔑 Consent page detected - attempting automatic consent...');

        // Try to extract and submit consent form
        const consentResult = await this.handleConsentPage(responseText, clientId, redirectUri);
        if (consentResult) {
          return consentResult;
        }
      }

      logger.warn('⚠️ OAuth flow did not complete automatically - manual consent may be required');
      return null;

    } catch (error: any) {
      logger.error('❌ Cookie-assisted OAuth failed:', error.message);
      return null;
    }
  }

  /**
   * Handle automatic consent page submission
   */
  private async handleConsentPage(html: string, clientId: string, redirectUri: string): Promise<string | null> {
    try {
      // Extract form action URL and hidden fields
      const formMatch = html.match(/<form[^>]*action="([^"]+)"[^>]*>/i);
      if (!formMatch) return null;

      const formAction = formMatch[1].replace(/&amp;/g, '&');
      logger.info(`🔑 Found consent form action: ${formAction}`);

      // Extract hidden form fields
      const hiddenFields: { [key: string]: string } = {};
      const hiddenMatches = html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi);

      for (const match of hiddenMatches) {
        hiddenFields[match[1]] = match[2];
      }

      // Add consent approval
      hiddenFields['consent'] = 'Accept';
      hiddenFields['submit'] = 'Accept';

      logger.info(`🔑 Submitting consent with ${Object.keys(hiddenFields).length} fields...`);

      // Submit consent form
      const consentResponse = await this.httpClient!.post(
        formAction.startsWith('http') ? formAction : `https://login.microsoftonline.com${formAction}`,
        new URLSearchParams(hiddenFields),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          maxRedirects: 0,
          validateStatus: (status) => status < 400
        }
      );

      // Check for redirect with authorization code
      if (consentResponse.status === 302 && consentResponse.headers.location) {
        const location = consentResponse.headers.location;
        const codeMatch = location.match(/code=([^&]+)/);

        if (codeMatch) {
          // Exchange code for token (same as before)
          const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
          const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';

          const tokenResponse = await this.httpClient!.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code: codeMatch[1],
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );

          if (tokenResponse.status === 200 && tokenResponse.data.access_token) {
            logger.info('✅ Successfully obtained access token after consent');
            return tokenResponse.data.access_token;
          }
        }
      }

      return null;
    } catch (error: any) {
      logger.error('❌ Consent handling failed:', error.message);
      return null;
    }
  }

  /**
   * Test access token with Graph API
   */
  private async testAccessToken(accessToken: string): Promise<{ success: boolean; userInfo?: any }> {
    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data.userPrincipalName) {
        logger.info('✅ Access token validated successfully');
        return { success: true, userInfo: response.data };
      }

      return { success: false };
    } catch (error: any) {
      logger.error('❌ Access token validation failed:', error.message);
      return { success: false };
    }
  }

  /**
   * Get email folders using Graph API access token
   */
  async getFolders(): Promise<EmailFolder[]> {
    if (!this.connected || !this.accessToken) {
      throw new Error('Not connected to Office365. Cookie OAuth authentication failed - please check cookies and Microsoft OAuth configuration.');
    }

    logger.info('🔍 Office365 Cookie OAuth: Getting folders via Graph API...');

    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
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
      logger.error('❌ Failed to get folders from Graph API:', error.message);
      throw new Error(`Failed to get folders: ${error.message}`);
    }
  }

  /**
   * Sync messages from specified folders using Graph API
   */
  async* syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.connected || !this.accessToken) {
      throw new Error('Not connected to Office365. Cookie OAuth authentication failed - please check cookies and Microsoft OAuth configuration.');
    }

    logger.info('🔍 Office365 Cookie OAuth: Starting message sync via Graph API...');

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
    if (!this.accessToken) return;

    let nextLink: string | null = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`;
    let processed = 0;
    let pageCount = 0;

    // Add query parameters for Graph API
    const params = new URLSearchParams();
    // Increase batch size to 999 (Graph API maximum)
    params.append('$top', (options.batchSize || 999).toString());
    params.append('$orderby', 'receivedDateTime desc');
    // Only fetch essential fields for email extraction (no body or attachments)
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
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Prefer': 'odata.maxpagesize=999'
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
    if (!this.connected || !this.accessToken) {
      throw new Error('Not connected to Office365. Cookie OAuth authentication failed.');
    }

    try {
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
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
   * Create HTTP client with cookies and proxy support
   */
  private createHttpClient(cookies: Office365Cookie[], proxy?: any): AxiosInstance {
    logger.info('🔍 Creating HTTP client with cookies and proxy');

    const cookieString = cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    logger.info('🔍 Cookie string length:', cookieString.length);
    logger.info('🔍 Cookie string preview:', cookieString.substring(0, 100) + '...');

    const config: any = {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    // Configure proxy if provided
    if (proxy && proxy.host) {
      logger.info(`🔐 Office365 Cookie: Configuring proxy ${proxy.host}:${proxy.port} (type: ${proxy.type})`);
      logger.info('🔍 Proxy details:', {
        host: proxy.host,
        port: proxy.port,
        type: proxy.type,
        hasUserId: !!proxy.userId,
        hasPassword: !!proxy.password,
        userIdLength: proxy.userId?.length || 0
      });

      try {
        if (proxy.type === 4 || proxy.type === 'SOCKS4') {
          // SOCKS4 proxy
          const proxyUrl = `socks4://${proxy.host}:${proxy.port}`;
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
          logger.info('✅ SOCKS4 proxy agent configured');
        } else if (proxy.type === 5 || proxy.type === 'SOCKS5') {
          // SOCKS5 proxy with optional authentication
          let proxyUrl = `socks5://${proxy.host}:${proxy.port}`;
          if (proxy.userId && proxy.password) {
            proxyUrl = `socks5://${proxy.userId}:${proxy.password}@${proxy.host}:${proxy.port}`;
            logger.info(`🔑 SOCKS5 proxy with authentication configured (user: ${proxy.userId})`);
          } else {
            logger.info('🔑 SOCKS5 proxy without authentication configured');
          }
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
          logger.info('✅ SOCKS5 proxy agent configured with URL:', proxyUrl.replace(/:[^:@]*@/, ':***@'));
        } else if (proxy.type === 1 || proxy.type === 'HTTP') {
          // HTTP/HTTPS proxy
          let proxyUrl = `http://${proxy.host}:${proxy.port}`;
          if (proxy.userId && proxy.password) {
            proxyUrl = `http://${proxy.userId}:${proxy.password}@${proxy.host}:${proxy.port}`;
            logger.info(`🔑 HTTP proxy with authentication configured (user: ${proxy.userId})`);
          } else {
            logger.info('🔑 HTTP proxy without authentication configured');
          }
          config.httpsAgent = new HttpsProxyAgent(proxyUrl);
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
          logger.info('✅ HTTP proxy agent configured');
        } else {
          logger.warn(`⚠️ Unsupported proxy type: ${proxy.type}, proceeding without proxy`);
        }
      } catch (error) {
        logger.error('❌ Failed to configure proxy, proceeding without proxy:', error);
      }
    } else {
      logger.info('🌐 Office365 Cookie: No proxy configured, using direct connection');
    }

    logger.info('🔍 Final axios config (without sensitive data):', {
      timeout: config.timeout,
      hasHttpsAgent: !!config.httpsAgent,
      hasHttpAgent: !!config.httpAgent,
      userAgent: config.headers['User-Agent']
    });

    return axios.create(config);
  }


  /**
   * Convert Microsoft Graph message to EmailMessage format
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
      body: message.body?.content || '',
      html: message.body?.contentType === 'html' ? message.body?.content : undefined,
      text: message.body?.contentType === 'text' ? message.body?.content : undefined,
      attachments: (message.attachments || []).map((attachment: any) => ({
        filename: attachment.name,
        size: attachment.size,
        contentType: attachment.contentType,
        contentId: attachment.contentId,
        content: Buffer.alloc(0) // Placeholder - attachments need separate API call
      })),
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

  /**
   * Validate cookie format and required fields
   */
  static validateCookies(cookies: Office365Cookie[]): { valid: boolean; error?: string } {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { valid: false, error: 'Cookies array is empty or invalid' };
    }

    const requiredCookies = ['ESTSAUTH', 'ESTSAUTHPERSISTENT'];
    const cookieNames = cookies.map(c => c.name);

    for (const required of requiredCookies) {
      if (!cookieNames.includes(required)) {
        return { valid: false, error: `Missing required cookie: ${required}` };
      }
    }

    // Check cookie structure
    for (const cookie of cookies) {
      if (!cookie.name || !cookie.value || !cookie.domain) {
        return { valid: false, error: 'Invalid cookie structure - missing name, value, or domain' };
      }
    }

    return { valid: true };
  }
}