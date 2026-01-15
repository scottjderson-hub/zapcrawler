import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { TokenService } from '../services/tokenService';
import { logger } from '../utils/logger';

export class TokenController {
  /**
   * Get all available token packages
   */
  static async getTokenPackages(req: AuthenticatedRequest, res: Response) {
    try {
      const packages = TokenService.getTokenPackages();
      
      res.json({
        packages,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getTokenPackages:', error);
      res.status(500).json({ 
        error: 'Failed to fetch token packages',
        success: false 
      });
    }
  }

  /**
   * Get user's current token balance and recent transactions
   */
  static async getUserTokenBalance(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tokenBalance = await TokenService.getUserTokenBalance(userId);
      
      res.json({
        tokenBalance,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getUserTokenBalance:', error);
      res.status(500).json({ 
        error: 'Failed to fetch token balance',
        success: false 
      });
    }
  }

  /**
   * Check if user has enough tokens for a specific action
   */
  static async checkTokenBalance(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { actionType } = req.body;
      
      if (!actionType || !['EMAIL_FETCH', 'CONNECTION_TEST'].includes(actionType)) {
        return res.status(400).json({ 
          error: 'Invalid action type',
          success: false 
        });
      }

      const balanceCheck = await TokenService.checkTokenBalance(userId, actionType);
      
      res.json({
        ...balanceCheck,
        success: true,
      });
    } catch (error) {
      logger.error('Error in checkTokenBalance:', error);
      res.status(500).json({ 
        error: 'Failed to check token balance',
        success: false 
      });
    }
  }

  /**
   * Get user's token transaction history
   */
  static async getTokenTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await TokenService.getUserTokenTransactions(userId, limit);
      
      res.json({
        transactions,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getTokenTransactions:', error);
      res.status(500).json({ 
        error: 'Failed to fetch token transactions',
        success: false 
      });
    }
  }

  /**
   * Get user's purchase history
   */
  static async getPurchaseHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const purchases = await TokenService.getUserPurchaseHistory(userId);
      
      res.json({
        purchases,
        success: true,
      });
    } catch (error) {
      logger.error('Error in getPurchaseHistory:', error);
      res.status(500).json({ 
        error: 'Failed to fetch purchase history',
        success: false 
      });
    }
  }

  /**
   * Calculate cost estimate for email sync job
   */
  static async calculateSyncCost(req: AuthenticatedRequest, res: Response) {
    try {
      const { emailCount } = req.body;
      
      if (!emailCount || emailCount < 0) {
        return res.status(400).json({ 
          error: 'Invalid email count',
          success: false 
        });
      }

      const costEstimate = TokenService.calculateEmailSyncCost(emailCount);
      
      res.json({
        costEstimate,
        success: true,
      });
    } catch (error) {
      logger.error('Error in calculateSyncCost:', error);
      res.status(500).json({ 
        error: 'Failed to calculate sync cost',
        success: false 
      });
    }
  }

  /**
   * Initiate token purchase (will be used with NOWPayments)
   */
  static async initiatePurchase(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { packageId, currency } = req.body;
      
      if (!packageId || !currency) {
        return res.status(400).json({ 
          error: 'Package ID and currency are required',
          success: false 
        });
      }

      const tokenPackage = TokenService.getTokenPackage(packageId);
      if (!tokenPackage) {
        return res.status(400).json({ 
          error: 'Invalid package ID',
          success: false 
        });
      }

      // Create purchase record
      const purchase = await TokenService.createTokenPurchase(
        userId,
        packageId,
        currency
      );

      if (!purchase) {
        return res.status(500).json({ 
          error: 'Failed to create purchase',
          success: false 
        });
      }

      // TODO: Integrate with NOWPayments to create actual payment
      // For now, return the purchase record
      res.json({
        purchase,
        tokenPackage,
        success: true,
      });
    } catch (error) {
      logger.error('Error in initiatePurchase:', error);
      res.status(500).json({ 
        error: 'Failed to initiate purchase',
        success: false 
      });
    }
  }

  /**
   * Manually deduct tokens (for testing purposes)
   */
  static async deductTokens(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { actionType, description } = req.body;
      
      if (!actionType || !['EMAIL_FETCH', 'CONNECTION_TEST'].includes(actionType)) {
        return res.status(400).json({ 
          error: 'Invalid action type',
          success: false 
        });
      }

      const success = await TokenService.deductTokens(
        userId,
        actionType,
        description || `Manual ${actionType} deduction`
      );

      if (!success) {
        return res.status(402).json({ 
          error: 'Insufficient tokens',
          success: false 
        });
      }

      // Get updated balance
      const tokenBalance = await TokenService.getUserTokenBalance(userId);
      
      res.json({
        message: 'Tokens deducted successfully',
        tokenBalance,
        success: true,
      });
    } catch (error) {
      logger.error('Error in deductTokens:', error);
      res.status(500).json({ 
        error: 'Failed to deduct tokens',
        success: false 
      });
    }
  }

  /**
   * Add tokens to user balance (for testing/admin purposes)
   */
  static async addTokens(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, cubes, reason } = req.body;
      
      if (!userId || !cubes || cubes <= 0) {
        return res.status(400).json({ 
          error: 'User ID and positive cube amount required',
          success: false 
        });
      }

      // Create a manual purchase record
      const purchase = await TokenService.createTokenPurchase(
        userId,
        'manual',
        'USD'
      );

      if (!purchase) {
        return res.status(500).json({ 
          error: 'Failed to create purchase record',
          success: false 
        });
      }

      // Complete the purchase to add tokens
      const success = await TokenService.completeTokenPurchase(purchase.id);

      if (!success) {
        return res.status(500).json({ 
          error: 'Failed to add tokens',
          success: false 
        });
      }

      const tokenBalance = await TokenService.getUserTokenBalance(userId);
      
      res.json({
        message: `Added ${cubes} tokens to user ${userId}`,
        reason: reason || 'Manual addition',
        tokenBalance,
        success: true,
      });
    } catch (error) {
      logger.error('Error in addTokens:', error);
      res.status(500).json({ 
        error: 'Failed to add tokens',
        success: false 
      });
    }
  }
}

// Export individual methods for route usage
export const getTokenPackages = TokenController.getTokenPackages;
export const getUserTokenBalance = TokenController.getUserTokenBalance;
export const checkTokenBalance = TokenController.checkTokenBalance;
export const getTokenTransactions = TokenController.getTokenTransactions;
export const getPurchaseHistory = TokenController.getPurchaseHistory;
export const calculateSyncCost = TokenController.calculateSyncCost;
export const initiatePurchase = TokenController.initiatePurchase;
export const deductTokens = TokenController.deductTokens;
export const addTokens = TokenController.addTokens;