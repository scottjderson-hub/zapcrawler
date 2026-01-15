import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class SuperAdminController {
  /**
   * Get all users with their token balances
   */
  static async getAllUsers(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const adminUserId = req.user.id;

      logger.info('Fetching all users for super admin:', { adminUserId });

      const { data, error } = await supabase.rpc('get_all_users_with_tokens', {
        p_admin_user_id: adminUserId
      });

      if (error) {
        logger.error('Error fetching all users:', {
          adminUserId,
          error: error.message
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch users',
          error: error.message
        });
      }

      logger.info(`Retrieved ${data?.length || 0} users for super admin`);

      return res.json({
        success: true,
        users: data || [],
        total: data?.length || 0
      });
    } catch (error) {
      logger.error('Error in getAllUsers:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get user statistics
   */
  static async getUserStatistics(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const adminUserId = req.user.id;

      const { data, error } = await supabase.rpc('get_user_statistics', {
        p_admin_user_id: adminUserId
      });

      if (error) {
        logger.error('Error fetching user statistics:', {
          adminUserId,
          error: error.message
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch statistics',
          error: error.message
        });
      }

      return res.json({
        success: true,
        statistics: data || {}
      });
    } catch (error) {
      logger.error('Error in getUserStatistics:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Add credits to a user account
   */
  static async addCredits(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const adminUserId = req.user.id;
      const { userId, cubes, reason } = req.body;

      if (!userId || !cubes) {
        return res.status(400).json({
          success: false,
          message: 'User ID and cubes amount are required'
        });
      }

      if (cubes <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cubes amount must be positive'
        });
      }

      logger.info('Adding credits to user:', {
        adminUserId,
        targetUserId: userId,
        cubes,
        reason
      });

      const { data, error } = await supabase.rpc('admin_add_user_tokens', {
        p_admin_user_id: adminUserId,
        p_target_user_id: userId,
        p_cubes_to_add: cubes,
        p_reason: reason || 'Admin credit adjustment'
      });

      if (error) {
        logger.error('Error adding credits:', {
          adminUserId,
          targetUserId: userId,
          error: error.message
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to add credits',
          error: error.message
        });
      }

      logger.info('Credits added successfully:', {
        adminUserId,
        targetUserId: userId,
        cubes,
        newBalance: data.new_balance
      });

      return res.json({
        success: true,
        message: 'Credits added successfully',
        data: {
          newBalance: data.new_balance,
          cubesAdded: data.cubes_added
        }
      });
    } catch (error) {
      logger.error('Error in addCredits:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to add credits',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Deduct credits from a user account
   */
  static async deductCredits(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const adminUserId = req.user.id;
      const { userId, cubes, reason } = req.body;

      if (!userId || !cubes) {
        return res.status(400).json({
          success: false,
          message: 'User ID and cubes amount are required'
        });
      }

      if (cubes <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cubes amount must be positive'
        });
      }

      logger.info('Deducting credits from user:', {
        adminUserId,
        targetUserId: userId,
        cubes,
        reason
      });

      const { data, error } = await supabase.rpc('admin_deduct_user_tokens', {
        p_admin_user_id: adminUserId,
        p_target_user_id: userId,
        p_cubes_to_deduct: cubes,
        p_reason: reason || 'Admin credit adjustment'
      });

      if (error) {
        logger.error('Error deducting credits:', {
          adminUserId,
          targetUserId: userId,
          error: error.message
        });

        // Check for insufficient balance error
        if (error.message.includes('Insufficient balance')) {
          return res.status(400).json({
            success: false,
            message: error.message
          });
        }

        return res.status(500).json({
          success: false,
          message: 'Failed to deduct credits',
          error: error.message
        });
      }

      logger.info('Credits deducted successfully:', {
        adminUserId,
        targetUserId: userId,
        cubes,
        newBalance: data.new_balance
      });

      return res.json({
        success: true,
        message: 'Credits deducted successfully',
        data: {
          newBalance: data.new_balance,
          cubesDeducted: data.cubes_deducted
        }
      });
    } catch (error) {
      logger.error('Error in deductCredits:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to deduct credits',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get admin audit logs
   */
  static async getAuditLogs(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const adminUserId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error } = await supabase.rpc('get_admin_audit_logs', {
        p_admin_user_id: adminUserId,
        p_limit: limit,
        p_offset: offset
      });

      if (error) {
        logger.error('Error fetching audit logs:', {
          adminUserId,
          error: error.message
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch audit logs',
          error: error.message
        });
      }

      return res.json({
        success: true,
        logs: data || [],
        total: data?.length || 0
      });
    } catch (error) {
      logger.error('Error in getAuditLogs:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get detailed user information
   */
  static async getUserDetails(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Get user info
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (userError || !userData) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get token balance
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Get recent transactions
      const { data: transactions, error: transError } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get email accounts count
      const { data: accounts, error: accountsError } = await supabase
        .from('email_accounts')
        .select('id')
        .eq('user_id', userId);

      // Get sync jobs count
      const { data: syncJobs, error: syncJobsError } = await supabase
        .from('sync_jobs')
        .select('id, status')
        .eq('user_id', userId);

      return res.json({
        success: true,
        user: {
          id: userData.user.id,
          email: userData.user.email,
          createdAt: userData.user.created_at,
          lastSignIn: userData.user.last_sign_in_at,
          tokenBalance: tokenData || null,
          emailAccountsCount: accounts?.length || 0,
          syncJobsCount: syncJobs?.length || 0,
          recentTransactions: transactions || []
        }
      });
    } catch (error) {
      logger.error('Error in getUserDetails:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user details',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export individual methods for route usage
export const getAllUsers = SuperAdminController.getAllUsers;
export const getUserStatistics = SuperAdminController.getUserStatistics;
export const addCredits = SuperAdminController.addCredits;
export const deductCredits = SuperAdminController.deductCredits;
export const getAuditLogs = SuperAdminController.getAuditLogs;
export const getUserDetails = SuperAdminController.getUserDetails;
