import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

/**
 * Middleware to check if authenticated user is a super admin
 */
export const requireSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = req.user.id;

    // Check if user is super admin using database function
    const { data, error } = await supabase.rpc('is_super_admin', {
      p_user_id: userId
    });

    if (error) {
      logger.error('Error checking super admin status:', {
        userId,
        error: error.message
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to verify admin status'
      });
    }

    if (!data) {
      logger.warn('Unauthorized super admin access attempt:', {
        userId,
        email: req.user.email,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }

    logger.info('Super admin access granted:', {
      userId,
      email: req.user.email,
      path: req.path
    });

    next();
  } catch (error) {
    logger.error('Super admin middleware error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
