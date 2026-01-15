import { Router } from 'express';
import { db, FEATURE_FLAGS } from '../adapters/databaseAdapter';
import { testProxyConnection } from '../services/proxyService';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/proxies - Get all proxies
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const proxies = await db.getProxiesForUser(req.userJwt);
    
    logger.info(`Fetched ${proxies.length} proxies for user ${req.user?.email}`);
    
    res.json({ 
      success: true,
      data: proxies,
      source: 'supabase'
    });
  } catch (err: any) {
    logger.error('Error fetching proxies:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Failed to fetch proxies'
    });
  }
});

// POST /api/proxies - Create a new proxy
router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const proxyData = {
      name: req.body.name,
      host: req.body.host,
      port: req.body.port,
      type: req.body.type,
      username: req.body.username || req.body.userId, // Handle both username and userId fields
      password: req.body.password,
    };

    // First, test the connection
    await testProxyConnection(proxyData as any);

    // If the test is successful, create and save the proxy using user-scoped method
    const newProxy = await db.createProxyForUser(req.userJwt, proxyData);
    
    logger.info(`Created new proxy ${newProxy.name} for user ${req.user?.email}`);
    
    return res.status(201).json({
      success: true,
      data: newProxy,
      source: 'supabase'
    });
  } catch (err: any) {
    logger.error('Error creating proxy:', err);
    
    // Check if the error is from the connection test
    if (err.message.startsWith('Proxy connection failed')) {
        return res.status(400).json({ 
          success: false,
          message: err.message 
        });
    }
    
    // Handle Supabase unique constraint violations
    if (err.message && err.message.includes('duplicate key value violates unique constraint')) {
      return res.status(409).json({ 
        success: false,
        message: 'A proxy with this name already exists.' 
      });
    }
    
    // Generic server error
    return res.status(500).json({ 
      success: false,
      message: 'An unexpected error occurred while creating proxy.' 
    });
  }
});

// PUT /api/proxies/:id - Update a proxy
router.put('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    // Check if proxy exists (user-scoped)
    const proxies = await db.getProxiesForUser(req.userJwt);
    const existingProxy = proxies.find(p => p.id === id);
    
    if (!existingProxy) {
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }
    
    // Prepare updated proxy data
    const updatedProxyData = {
      name: req.body.name || existingProxy.name,
      host: req.body.host || existingProxy.host,
      port: req.body.port || existingProxy.port,
      type: req.body.type || existingProxy.type,
      username: req.body.username || req.body.username || existingProxy.username,
      password: req.body.password || existingProxy.password,
    };
    
    // Test the updated proxy connection before saving
    try {
      await testProxyConnection(updatedProxyData as any);
      logger.info(`Proxy connection test passed for updated proxy ${updatedProxyData.name}`);
    } catch (testError: any) {
      logger.error(`Proxy connection test failed for ${updatedProxyData.name}:`, testError);
      return res.status(400).json({
        success: false,
        message: `Proxy connection test failed: ${testError.message}`
      });
    }
    
    // Update the proxy using user-scoped database adapter
    const updatedProxy = await db.updateProxyForUser(req.userJwt, id, updatedProxyData);
    
    logger.info(`Updated proxy ${updatedProxy.name} (${id}) for user ${req.user?.email}`);
    
    res.json({
      success: true,
      message: 'Proxy updated successfully',
      data: updatedProxy,
      source: 'supabase'
    });
  } catch (err: any) {
    logger.error('Error updating proxy:', err);
    
    // Handle Supabase unique constraint violations
    if (err.message && err.message.includes('duplicate key value violates unique constraint')) {
      return res.status(409).json({ 
        success: false,
        message: 'A proxy with this name already exists.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: err.message || 'Failed to update proxy'
    });
  }
});

// POST /api/proxies/:id/test - Test an existing proxy
router.post('/:id/test', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    // Get the proxy from database (user-scoped)
    const proxies = await db.getProxiesForUser(req.userJwt);
    const proxy = proxies.find(p => p.id === id);
    
    if (!proxy) {
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }
    
    // Test the proxy connection - pass the proxy object directly so username resolution can work  
    await testProxyConnection(proxy);
    
    logger.info(`Proxy ${proxy.name} (${id}) tested successfully for user ${req.user?.email}`);
    
    res.json({
      success: true,
      message: 'Proxy connection test successful',
      data: {
        id: proxy.id,
        name: proxy.name,
        host: proxy.host,
        port: proxy.port,
        type: proxy.type
      }
    });
  } catch (err: any) {
    logger.error(`Error testing proxy ${req.params.id}:`, err);
    
    res.status(400).json({
      success: false,
      message: err.message || 'Proxy connection test failed'
    });
  }
});

// DELETE /api/proxies/:id - Delete a proxy
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userJwt) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    // Delete proxy using user-scoped database adapter
    await db.deleteProxyForUser(req.userJwt, id);
    
    logger.info(`Proxy ${id} deleted successfully for user ${req.user?.email}`);
    
    res.json({ 
      success: true,
      message: 'Proxy deleted successfully',
      source: 'supabase'
    });
  } catch (err: any) {
    logger.error('Error deleting proxy:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Failed to delete proxy'
    });
  }
});

export default router;
