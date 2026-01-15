import { Request, Response, NextFunction } from 'express';
import { getMicrosoftOAuthService } from '../services/microsoftOAuth';
import { logger } from '../utils/logger';

// In-memory store for OAuth completion status
// In production, this should be in Redis or a database
const oauthCompletionStore: Map<string, any> = new Map();

/**
 * Initiate Microsoft OAuth2 flow
 */
export const initiateMicrosoftOAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    logger.info(`🔑 Initiating Microsoft OAuth2 flow for ${email}`);

    const oauthService = getMicrosoftOAuthService();
    const state = `${Date.now()}_${email}`;

    const authUrl = await oauthService.getAuthUrl(state);

    logger.info(`✅ OAuth2 authorization URL generated for ${email}`);

    res.json({
      success: true,
      authUrl,
      state,
      message: 'OAuth2 flow initiated successfully'
    });

  } catch (error: any) {
    logger.error('❌ Failed to initiate Microsoft OAuth2:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate OAuth2 flow'
    });
  }
};

/**
 * Handle Microsoft OAuth2 callback
 */
export const handleMicrosoftOAuthCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error, error_description } = req.query;

    logger.info('🔑 Microsoft OAuth2 callback received', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error
    });

    if (error) {
      logger.error('❌ OAuth2 callback error:', { error, error_description });
      return res.status(400).json({
        success: false,
        message: error_description || error || 'OAuth2 authorization failed'
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code or state parameter'
      });
    }

    const oauthService = getMicrosoftOAuthService();
    const tokens = await oauthService.getTokenFromCode(code as string, state as string);

    logger.info(`✅ OAuth2 tokens obtained for ${tokens.email}`);

    // Store completion status for polling
    oauthCompletionStore.set(state as string, {
      completed: true,
      tokens,
      timestamp: Date.now()
    });

    // Clean up old entries (older than 10 minutes)
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    for (const [key, value] of oauthCompletionStore.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        oauthCompletionStore.delete(key);
      }
    }

    res.json({
      success: true,
      tokens,
      message: 'OAuth2 authentication successful'
    });

  } catch (error: any) {
    logger.error('❌ Failed to handle OAuth2 callback:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process OAuth2 callback'
    });
  }
};

/**
 * Check OAuth2 completion status (for polling)
 */
export const checkOAuthStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state } = req.query;

    if (!state) {
      return res.status(400).json({
        success: false,
        message: 'State parameter is required'
      });
    }

    // Check if OAuth flow for this state has completed
    const completionData = oauthCompletionStore.get(state as string);

    if (completionData && completionData.completed) {
      // OAuth completed, return tokens and remove from store
      oauthCompletionStore.delete(state as string);

      res.json({
        success: true,
        completed: true,
        tokens: completionData.tokens,
        message: 'OAuth2 flow completed successfully'
      });
    } else {
      res.json({
        success: true,
        completed: false,
        message: 'OAuth2 flow still in progress'
      });
    }

  } catch (error: any) {
    logger.error('❌ Failed to check OAuth2 status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check OAuth2 status'
    });
  }
};