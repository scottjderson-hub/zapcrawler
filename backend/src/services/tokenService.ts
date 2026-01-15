import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { supabaseRealtime } from './supabaseRealtime';

export interface TokenPackage {
  id: string;
  name: string;
  cubes: number;
  priceUsd: number;
  bonusPercentage: number;
  popular?: boolean;
}

export interface UserTokenBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  recentTransactions: TokenTransaction[];
}

export interface TokenTransaction {
  id: string;
  actionType: string;
  cubesConsumed: number;
  description?: string;
  createdAt: string;
}

export interface TokenPurchase {
  id: string;
  userId: string;
  packageId: string;
  cubesPurchased: number;
  priceUsd: number;
  currency: string;
  paymentId?: string;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'expired';
  nowpaymentsData?: any;
  createdAt: string;
  completedAt?: string;
}

export class TokenService {
  // Token package definitions
  static readonly TOKEN_PACKAGES: TokenPackage[] = [
    {
      id: 'starter',
      name: 'Starter',
      cubes: 2000,
      priceUsd: 10,
      bonusPercentage: 0,
    },
    {
      id: 'basic',
      name: 'Basic',
      cubes: 4200,
      priceUsd: 20,
      bonusPercentage: 5,
    },
    {
      id: 'standard',
      name: 'Standard',
      cubes: 7500,
      priceUsd: 35,
      bonusPercentage: 7,
    },
    {
      id: 'premium',
      name: 'Premium',
      cubes: 11000,
      priceUsd: 50,
      bonusPercentage: 10,
      popular: true,
    },
    {
      id: 'professional',
      name: 'Professional',
      cubes: 17250,
      priceUsd: 75,
      bonusPercentage: 15,
    },
    {
      id: 'business',
      name: 'Business',
      cubes: 23000,
      priceUsd: 100,
      bonusPercentage: 15,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      cubes: 48000,
      priceUsd: 200,
      bonusPercentage: 20,
    },
    {
      id: 'ultimate',
      name: 'Ultimate',
      cubes: 125000,
      priceUsd: 500,
      bonusPercentage: 25,
    },
  ];

  // Action costs
  static readonly ACTION_COSTS = {
    EMAIL_FETCH: 1,
    CONNECTION_TEST: 5,
  };

  /**
   * Get all available token packages
   */
  static getTokenPackages(): TokenPackage[] {
    return this.TOKEN_PACKAGES;
  }

  /**
   * Get a specific token package by ID
   */
  static getTokenPackage(packageId: string): TokenPackage | null {
    return this.TOKEN_PACKAGES.find(pkg => pkg.id === packageId) || null;
  }

  /**
   * Get user's token balance and recent transactions
   */
  static async getUserTokenBalance(userId: string): Promise<UserTokenBalance> {
    try {
      const { data, error } = await supabase.rpc('get_user_token_summary', {
        p_user_id: userId
      });

      if (error) {
        logger.error('Error fetching user token balance:', error);
        throw new Error('Failed to fetch token balance');
      }

      const result = data[0] || {
        balance: 0,
        total_purchased: 0,
        total_consumed: 0,
        recent_transactions: []
      };

      return {
        balance: result.balance,
        totalPurchased: result.total_purchased,
        totalConsumed: result.total_consumed,
        recentTransactions: result.recent_transactions || []
      };
    } catch (error) {
      logger.error('Error in getUserTokenBalance:', error);
      throw error;
    }
  }

  /**
   * Check if user has sufficient tokens for an action
   */
  static async checkTokenBalance(userId: string, actionType: keyof typeof TokenService.ACTION_COSTS): Promise<{
    hasEnoughTokens: boolean;
    currentBalance: number;
    requiredTokens: number;
  }> {
    try {
      const requiredTokens = this.ACTION_COSTS[actionType];
      const tokenBalance = await this.getUserTokenBalance(userId);

      return {
        hasEnoughTokens: tokenBalance.balance >= requiredTokens,
        currentBalance: tokenBalance.balance,
        requiredTokens,
      };
    } catch (error) {
      logger.error('Error checking token balance:', error);
      throw error;
    }
  }

  /**
   * Deduct tokens for an action
   */
  static async deductTokens(
    userId: string,
    actionType: keyof typeof TokenService.ACTION_COSTS,
    description?: string,
    syncJobId?: string,
    emailAccountId?: string
  ): Promise<boolean> {
    try {
      const cubesConsumed = this.ACTION_COSTS[actionType];
      
      const { data, error } = await supabase.rpc('deduct_user_tokens', {
        p_user_id: userId,
        p_action_type: actionType.toLowerCase(),
        p_cubes_consumed: cubesConsumed,
        p_description: description,
        p_sync_job_id: syncJobId || null,
        p_email_account_id: emailAccountId || null
      });

      if (error) {
        logger.error('Error deducting tokens:', error);
        return false;
      }

      const success = data || false;

      if (success) {
        logger.info(`Deducted ${cubesConsumed} tokens for ${actionType} - User: ${userId}`);

        // Get updated balance and broadcast real-time update
        try {
          const balanceResult = await this.getUserTokenBalance(userId);
          await supabaseRealtime.broadcastTokenBalanceUpdate(
            userId,
            balanceResult.balance,
            cubesConsumed,
            actionType
          );
        } catch (broadcastError) {
          logger.error('Error broadcasting token balance update:', broadcastError);
        }
      } else {
        logger.warn(`Insufficient tokens for ${actionType} - User: ${userId}`);
      }

      return success;
    } catch (error) {
      logger.error('Error in deductTokens:', error);
      return false;
    }
  }

  /**
   * Deduct tokens for multiple email fetches (bulk operation)
   */
  static async deductEmailFetchTokens(
    userId: string,
    emailCount: number,
    syncJobId?: string,
    description?: string
  ): Promise<boolean> {
    try {
      const cubesConsumed = emailCount * this.ACTION_COSTS.EMAIL_FETCH;
      
      const { data, error } = await supabase.rpc('deduct_user_tokens', {
        p_user_id: userId,
        p_action_type: 'email_fetch_bulk',
        p_cubes_consumed: cubesConsumed,
        p_description: description || `Fetched ${emailCount} emails`,
        p_sync_job_id: syncJobId || null,
        p_email_account_id: null
      });

      if (error) {
        logger.error('Error deducting bulk email fetch tokens:', error);
        return false;
      }

      const success = data || false;

      if (success) {
        logger.info(`Deducted ${cubesConsumed} tokens for ${emailCount} emails - User: ${userId}`);

        // Get updated balance and broadcast real-time update
        try {
          const balanceResult = await this.getUserTokenBalance(userId);
          await supabaseRealtime.broadcastTokenBalanceUpdate(
            userId,
            balanceResult.balance,
            cubesConsumed,
            `EMAIL_FETCH_BULK_${emailCount}`
          );
        } catch (broadcastError) {
          logger.error('Error broadcasting token balance update for email fetch:', broadcastError);
        }
      } else {
        logger.warn(`Insufficient tokens for ${emailCount} emails - User: ${userId}`);
      }

      return success;
    } catch (error) {
      logger.error('Error in deductEmailFetchTokens:', error);
      return false;
    }
  }

  /**
   * Create a token purchase record
   */
  static async createTokenPurchase(
    userId: string,
    packageId: string,
    currency: string,
    paymentId?: string
  ): Promise<TokenPurchase | null> {
    try {
      const tokenPackage = this.getTokenPackage(packageId);
      if (!tokenPackage) {
        throw new Error(`Invalid package ID: ${packageId}`);
      }

      const { data, error } = await supabase
        .from('token_purchases')
        .insert({
          user_id: userId,
          package_id: packageId,
          cubes_purchased: tokenPackage.cubes,
          price_usd: tokenPackage.priceUsd,
          currency,
          payment_id: paymentId,
          payment_status: 'pending'
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating token purchase:', error);
        throw error;
      }

      logger.info(`Created token purchase for user ${userId}: ${packageId} package`);
      return data as TokenPurchase;
    } catch (error) {
      logger.error('Error in createTokenPurchase:', error);
      return null;
    }
  }

  /**
   * Complete a token purchase and add tokens to user balance
   */
  static async completeTokenPurchase(
    purchaseId: string,
    paymentData?: any
  ): Promise<boolean> {
    try {
      // Update purchase status
      const { data: purchase, error: updateError } = await supabase
        .from('token_purchases')
        .update({
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
          nowpayments_data: paymentData
        })
        .eq('id', purchaseId)
        .select()
        .single();

      if (updateError) {
        logger.error('Error updating purchase status:', updateError);
        return false;
      }

      // Add tokens to user balance
      const { error: addTokensError } = await supabase.rpc('add_user_tokens', {
        p_user_id: purchase.user_id,
        p_cubes_to_add: purchase.cubes_purchased,
        p_purchase_id: purchaseId
      });

      if (addTokensError) {
        logger.error('Error adding tokens to user balance:', addTokensError);
        return false;
      }

      logger.info(`Completed token purchase ${purchaseId} - Added ${purchase.cubes_purchased} tokens to user ${purchase.user_id}`);
      return true;
    } catch (error) {
      logger.error('Error in completeTokenPurchase:', error);
      return false;
    }
  }

  /**
   * Get user's purchase history
   */
  static async getUserPurchaseHistory(userId: string): Promise<TokenPurchase[]> {
    try {
      const { data, error } = await supabase
        .from('token_purchases')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching purchase history:', error);
        throw error;
      }

      return data as TokenPurchase[];
    } catch (error) {
      logger.error('Error in getUserPurchaseHistory:', error);
      return [];
    }
  }

  /**
   * Get token transaction history for a user
   */
  static async getUserTokenTransactions(
    userId: string,
    limit: number = 50
  ): Promise<TokenTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching token transactions:', error);
        throw error;
      }

      return data?.map(t => ({
        id: t.id,
        actionType: t.action_type,
        cubesConsumed: t.cubes_consumed,
        description: t.description,
        createdAt: t.created_at
      })) || [];
    } catch (error) {
      logger.error('Error in getUserTokenTransactions:', error);
      return [];
    }
  }

  /**
   * Calculate estimated cost for email sync job
   */
  static calculateEmailSyncCost(emailCount: number): {
    totalCubes: number;
    totalUsd: number;
    breakdown: {
      emailFetches: number;
      emailFetchCost: number;
      connectionTest: number;
      connectionTestCost: number;
    };
  } {
    const emailFetchCost = emailCount * this.ACTION_COSTS.EMAIL_FETCH;
    const connectionTestCost = this.ACTION_COSTS.CONNECTION_TEST;
    const totalCubes = emailFetchCost + connectionTestCost;
    
    // Approximate USD cost (based on $10 = 2000 cubes)
    const totalUsd = (totalCubes / 2000) * 10;

    return {
      totalCubes,
      totalUsd: Math.round(totalUsd * 100) / 100, // Round to 2 decimal places
      breakdown: {
        emailFetches: emailCount,
        emailFetchCost,
        connectionTest: 1,
        connectionTestCost,
      },
    };
  }
}