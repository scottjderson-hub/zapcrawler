import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { SubscriptionService, PlanType } from '../services/subscriptionService';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class BillingController {
  /**
   * Get current user subscription status
   */
  static async getUserSubscription(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Use the new unified function from Supabase
      const { data, error } = await supabase.rpc('get_user_subscription_data', {
        user_id_param: userId
      });

      if (error) {
        logger.error('Error fetching subscription data:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch subscription data',
          success: false 
        });
      }

      if (!data || !data.success) {
        return res.status(404).json({ 
          error: data?.error || 'User subscription data not found',
          success: false 
        });
      }

      // Return the data in the expected format
      res.json({
        subscription: data.subscription,
        usageStats: data.usageStats,
        subscriptionStatus: data.subscriptionStatus,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getUserSubscription:', error);
      res.status(500).json({ 
        error: 'Failed to fetch subscription',
        success: false 
      });
    }
  }

  /**
   * Get all available plans
   */
  static async getPlans(req: AuthenticatedRequest, res: Response) {
    try {
      const plans = await SubscriptionService.getPlanConfigurations();
      
      res.json({
        plans,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getPlans:', error);
      res.status(500).json({ 
        error: 'Failed to fetch plans',
        success: false 
      });
    }
  }

  /**
   * Check if user can add email account
   */
  static async checkAccountLimit(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limitCheck = await SubscriptionService.checkAccountLimit(userId);
      
      res.json({
        ...limitCheck,
        success: true,
      });
    } catch (error) {
      logger.error('Error in checkAccountLimit:', error);
      res.status(500).json({ 
        error: 'Failed to check account limit',
        success: false 
      });
    }
  }

  /**
   * Check if emails should be masked for user
   */
  static async checkEmailMasking(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const shouldMask = await SubscriptionService.shouldMaskEmailsForUser(userId);
      
      res.json({
        shouldMask,
        success: true,
      });
    } catch (error) {
      logger.error('Error in checkEmailMasking:', error);
      res.status(500).json({ 
        error: 'Failed to check email masking status',
        success: false 
      });
    }
  }

  /**
   * Update user subscription (for internal use after payment confirmation)
   */
  static async updateSubscription(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { planType, paymentTransactionId } = req.body;

      if (!planType || !['professional', 'enterprise'].includes(planType)) {
        return res.status(400).json({ 
          error: 'Invalid plan type',
          success: false 
        });
      }

      const subscription = await SubscriptionService.updateUserSubscription(
        userId, 
        planType as PlanType, 
        paymentTransactionId
      );

      res.json({
        subscription,
        success: true,
      });
    } catch (error) {
      logger.error('Error in updateSubscription:', error);
      res.status(500).json({ 
        error: 'Failed to update subscription',
        success: false 
      });
    }
  }

  /**
   * Cancel user subscription
   */
  static async cancelSubscription(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await SubscriptionService.cancelUserSubscription(userId);

      res.json({
        message: 'Subscription will be cancelled at the end of the current period',
        success: true,
      });
    } catch (error) {
      logger.error('Error in cancelSubscription:', error);
      res.status(500).json({ 
        error: 'Failed to cancel subscription',
        success: false 
      });
    }
  }

  /**
   * Resume cancelled subscription
   */
  static async resumeSubscription(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await SubscriptionService.resumeUserSubscription(userId);

      res.json({
        message: 'Subscription resumed successfully',
        success: true,
      });
    } catch (error) {
      logger.error('Error in resumeSubscription:', error);
      res.status(500).json({ 
        error: 'Failed to resume subscription',
        success: false 
      });
    }
  }

  /**
   * Get user usage statistics
   */
  static async getUsageStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const usageStats = await SubscriptionService.getUserUsageStats(userId);
      const limitCheck = await SubscriptionService.checkAccountLimit(userId);
      
      res.json({
        usageStats,
        limits: limitCheck,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getUsageStats:', error);
      res.status(500).json({ 
        error: 'Failed to fetch usage statistics',
        success: false 
      });
    }
  }
}

// Export individual methods for route usage
export const getUserSubscription = BillingController.getUserSubscription;
export const getPlans = BillingController.getPlans;
export const checkAccountLimit = BillingController.checkAccountLimit;
export const checkEmailMasking = BillingController.checkEmailMasking;
export const updateSubscription = BillingController.updateSubscription;
export const cancelSubscription = BillingController.cancelSubscription;
export const resumeSubscription = BillingController.resumeSubscription;
export const getUsageStats = BillingController.getUsageStats;