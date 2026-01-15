import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { db, FEATURE_FLAGS } from '../adapters/databaseAdapter';

// Simple in-memory cache with TTL (time-to-live)
interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheItem<any>>();

// Helper function to get data from cache
const getFromCache = <T>(key: string): T | null => {
  const item = cache.get(key);
  if (!item) return null;
  
  // Check if item has expired
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return item.data;
};

// Helper function to set data in cache with TTL in seconds
const setInCache = <T>(key: string, data: T, ttlSeconds: number): void => {
  cache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
};

/**
 * Optimized endpoint that fetches all dashboard data in parallel
 * This reduces the number of API calls from 3 to 1, improving page load performance
 */
export const getDashboardData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startTime = Date.now();
    
    // Check in-memory cache first
    const cacheKey = 'dashboard_data';
    const cachedData = getFromCache(cacheKey);
    
    if (cachedData) {
      logger.debug('Returning cached dashboard data');
      return res.json({
        success: true,
        data: cachedData,
        cached: true,
        responseTime: Date.now() - startTime
      });
    }

    // Fetch all data in parallel for maximum performance using Supabase adapter
    const [accounts, jobs, proxies] = await Promise.all([
      db.getAccounts(),
      db.getSyncJobs(),
      db.getProxies()
    ]);
    
    // Sort jobs by creation date and limit to 50 most recent
    const sortedJobs = jobs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);

    const dashboardData = {
      accounts: accounts || [],
      jobs: sortedJobs || [],
      proxies: proxies || [],
      stats: {
        totalAccounts: accounts.length,
        connectedAccounts: accounts.filter((acc: any) => acc.status === 'connected').length,
        totalJobs: sortedJobs.length,
        completedJobs: sortedJobs.filter((job: any) => job.status === 'completed').length,
        totalProxies: proxies.length
      },
      source: FEATURE_FLAGS.COMPLETE_MIGRATION ? 'supabase' : 'mongodb'
    };

    // Cache in memory for 30 seconds to balance freshness and performance
    setInCache(cacheKey, dashboardData, 30);

    const responseTime = Date.now() - startTime;
    logger.info(`Dashboard data fetched in ${responseTime}ms`);

    res.json({
      success: true,
      data: dashboardData,
      cached: false,
      responseTime
    });

  } catch (error: any) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

/**
 * Lightweight endpoint for real-time stats only
 */
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get counts using Supabase adapter
    const [accounts, jobs, proxies] = await Promise.all([
      db.getAccounts(),
      db.getSyncJobs(),
      db.getProxies()
    ]);
    
    const accountCount = accounts.length;
    const jobCount = jobs.length;
    const proxyCount = proxies.length;

    res.json({
      success: true,
      data: {
        totalAccounts: accountCount,
        totalJobs: jobCount,
        totalProxies: proxyCount
      },
      source: FEATURE_FLAGS.COMPLETE_MIGRATION ? 'supabase' : 'mongodb'
    });

  } catch (error: any) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};
