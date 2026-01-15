import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class UserController {
  /**
   * Initialize user billing data after successful signup
   * This should be called by the frontend after Supabase auth signup
   */
  static async initializeUser(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userId = req.user.id;
      
      logger.info('Initializing billing data for new user', {
        userId,
        email: req.user.email
      });

      // Call the Supabase function to initialize billing data
      const { data, error } = await supabase.rpc('initialize_user_billing_data', {
        user_id_param: userId
      });

      if (error) {
        logger.error('Error initializing user billing data', {
          userId,
          error: error.message
        });
        
        return res.status(500).json({
          success: false,
          message: 'Failed to initialize user billing data',
          error: error.message
        });
      }

      if (data && !data.success) {
        logger.warn('User billing initialization returned warning', {
          userId,
          data
        });
      }

      logger.info('User billing data initialized successfully', {
        userId,
        email: req.user.email
      });

      return res.json({
        success: true,
        message: 'User initialized successfully',
        data: data || { initialized: true }
      });

    } catch (error) {
      logger.error('Unexpected error during user initialization', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to initialize user',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get user profile and billing information
   */
  static async getUserProfile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userId = req.user.id;

      // Get user subscription and usage data
      const { data: subscriptionData, error: subError } = await supabase
        .from('user_subscription_status')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (subError && subError.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error fetching user subscription', {
          userId,
          error: subError.message
        });
      }

      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          subscription: subscriptionData || null
        }
      });

    } catch (error) {
      logger.error('Error fetching user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export individual methods for route usage
export const initializeUser = UserController.initializeUser;
export const getUserProfile = UserController.getUserProfile;