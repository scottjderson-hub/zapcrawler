import { ConfidentialClientApplication, AuthenticationResult, Configuration } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { logger } from '../utils/logger';

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresOn: Date;
  email: string;
}

export class MicrosoftOAuthService {
  private msalApp: ConfidentialClientApplication;
  private config: MicrosoftOAuthConfig;

  constructor(config: MicrosoftOAuthConfig) {
    this.config = config;
    
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      },
      system: {
        loggerOptions: {
          loggerCallback: (level, message, containsPii) => {
            if (!containsPii) {
              logger.debug(`MSAL ${level}: ${message}`);
            }
          },
          piiLoggingEnabled: false,
          logLevel: 3, // LogLevel.Info
        }
      }
    };

    this.msalApp = new ConfidentialClientApplication(msalConfig);
  }

  /**
   * Generate OAuth2 authorization URL for user consent
   */
  async getAuthUrl(state?: string): Promise<string> {
    // Use direct OAuth2 URL instead of MSAL to have more control
    // Use Graph API scopes for consistent API usage
    const scopes = 'User.Read Mail.Read offline_access';
    const baseUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize`;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: scopes,
      response_mode: 'query',
      state: state || `${Date.now()}`,
      prompt: 'consent', // Force consent to ensure permissions are granted
      access_type: 'offline' // Ensure refresh token is provided
    });

    const authUrl = `${baseUrl}?${params.toString()}`;
    logger.info('🔑 Generated OAuth2 URL with IMAP scopes:', authUrl);

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async getTokenFromCode(code: string, state?: string): Promise<OAuthTokens> {
    try {
      // Use direct HTTP call for token exchange instead of MSAL
      const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        scope: 'User.Read Mail.Read offline_access'
      });

      logger.info('🔑 Exchanging authorization code for access token...');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      const tokenData = await response.json();

      if (!response.ok || tokenData.error) {
        logger.error('❌ Token exchange failed:', tokenData);
        throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
      }

      if (!tokenData.access_token) {
        throw new Error('No access token received from Microsoft');
      }

      // Get user email from Graph API
      const email = await this.getUserEmail(tokenData.access_token);

      logger.info('✅ Token exchange successful for user:', email);

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || undefined,
        expiresOn: new Date(Date.now() + (tokenData.expires_in * 1000)), // Convert seconds to milliseconds
        email: email
      };
    } catch (error: unknown) {
      logger.error('Failed to get token from authorization code:', error);
      throw new Error(`OAuth token exchange failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, email: string): Promise<OAuthTokens> {
    try {
      const scopes = [
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Mail.Read'
      ];

      const refreshTokenRequest = {
        refreshToken: refreshToken,
        scopes: scopes,
      };

      const response: AuthenticationResult | null = await this.msalApp.acquireTokenByRefreshToken(refreshTokenRequest);
      
      if (!response) {
        throw new Error('No response received from refresh token request');
      }
      
      if (!response.accessToken) {
        throw new Error('No access token received from refresh');
      }

      return {
        accessToken: response.accessToken,
        refreshToken: (response as any).refreshToken || refreshToken, // Keep old refresh token if new one not provided
        expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
        email: email
      };
    } catch (error: unknown) {
      logger.error('Failed to refresh access token:', error);
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user email from Microsoft Graph API
   */
  private async getUserEmail(accessToken: string): Promise<string> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      const user = await graphClient.api('/me').get();
      return user.mail || user.userPrincipalName;
    } catch (error: unknown) {
      logger.error('Failed to get user email from Graph API:', error);
      throw new Error(`Failed to retrieve user email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate SASL XOAUTH2 string for IMAP authentication
   */
  generateXOAuth2String(email: string, accessToken: string): string {
    const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
  }

  /**
   * Validate if access token is still valid
   */
  isTokenValid(expiresOn: Date): boolean {
    const now = new Date();
    const buffer = 5 * 60 * 1000; // 5 minute buffer
    return expiresOn.getTime() > (now.getTime() + buffer);
  }
}

// Default instance for the service
let microsoftOAuthService: MicrosoftOAuthService | null = null;

export function initializeMicrosoftOAuth(): MicrosoftOAuthService {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth configuration missing. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.');
  }

  const config: MicrosoftOAuthConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common', // 'common' allows both personal and work accounts
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback'
  };

  microsoftOAuthService = new MicrosoftOAuthService(config);
  return microsoftOAuthService;
}

export function getMicrosoftOAuthService(): MicrosoftOAuthService {
  if (!microsoftOAuthService) {
    return initializeMicrosoftOAuth();
  }
  return microsoftOAuthService;
}