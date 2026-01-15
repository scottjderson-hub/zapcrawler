import { Router } from 'express';
import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import * as emailController from '../controllers/emailController';
import * as dashboardController from '../controllers/dashboardController';
import * as billingController from '../controllers/billingController';
import * as userController from '../controllers/userController';
import * as tokenController from '../controllers/tokenController';
import * as authController from '../controllers/authController';
import * as superAdminController from '../controllers/superAdminController';
import { authenticateUser } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import proxiesRouter from './proxies';

const router = Router();

// Test endpoint (no auth required)
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working', 
    timestamp: new Date().toISOString() 
  });
});

// Microsoft OAuth2 Routes (before authentication middleware)
router.post('/auth/microsoft/init', [
  body('email').isEmail().withMessage('Valid email address is required'),
], validateRequest, authController.initiateMicrosoftOAuth);

router.get('/auth/microsoft/callback', authController.handleMicrosoftOAuthCallback);

router.get('/auth/microsoft/status', authController.checkOAuthStatus);

// Authentication Middleware for other routes
router.use(authenticateUser);

// User Routes
router.post('/user/initialize', userController.initializeUser);
router.get('/user/profile', userController.getUserProfile);

// Dashboard Routes (optimized for performance)
router.get('/dashboard/data', dashboardController.getDashboardData);
router.get('/dashboard/stats', dashboardController.getDashboardStats);

// Billing Routes
router.get('/billing/subscription', billingController.getUserSubscription);
router.get('/billing/plans', billingController.getPlans);
router.get('/billing/usage', billingController.getUsageStats);
router.get('/billing/account-limit', billingController.checkAccountLimit);
router.get('/billing/email-masking', billingController.checkEmailMasking);
router.post(
  '/billing/subscription',
  [
    body('planType').isIn(['professional', 'enterprise']).withMessage('Valid plan type is required'),
    body('paymentTransactionId').optional().isString().withMessage('Payment transaction ID must be a string'),
  ],
  validateRequest,
  billingController.updateSubscription
);
router.post('/billing/cancel', billingController.cancelSubscription);
router.post('/billing/resume', billingController.resumeSubscription);

// Email Account Routes
// Auto-detect email settings
router.post(
  '/accounts/auto-detect',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  emailController.autoDetectSettings
);

// Cancel bulk import operations
router.post(
  '/accounts/cancel-bulk',
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
  ],
  validateRequest,
  emailController.cancelBulkOperations
);

// Add email account
router.post(
  '/accounts',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('provider').toLowerCase().isIn(['gmail', 'outlook', 'yahoo', 'imap', 'pop3', 'exchange', 'comcast', 'office365_cookies', 'office365', 'office365_oauth', 'outlook_oauth']).withMessage('Valid provider is required'),
    body('auth').isObject().withMessage('Authentication details are required'),
  ],
  validateRequest,
  emailController.addEmailAccount
);

router.get(
  '/accounts',
  emailController.listEmailAccounts
);

router.get(
  '/accounts/:accountId',
  [
    param('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.getEmailAccount
);

router.delete(
  '/accounts/:accountId',
  [
    param('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.removeEmailAccount
);

router.delete(
  '/accounts',
  emailController.removeAllEmailAccounts
);

router.get(
  '/accounts/:accountId/folders',
  [
    param('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.listFolders
);

// Email Sync Routes
router.get('/sync/jobs', emailController.listSyncJobs);

// Proxy Routes
router.use('/proxies', proxiesRouter);

router.post(
  '/sync/start',
  [
    body('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
    body('folders').optional().isArray().withMessage('Folders must be an array'),
    body('name').optional().isString().withMessage('Job name must be a string'),
    body('since').optional().isISO8601().withMessage('Invalid date format'),
    body('proxyId').optional().isString().withMessage('Proxy ID must be a string'),
  ],
  validateRequest,
  emailController.startSync
);

router.post(
  '/sync/stop',
  [
    body('syncId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid sync ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.stopSync
);

router.delete(
  '/sync/jobs/:syncJobId',
  [
    param('syncJobId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid sync job ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.deleteSyncJob
);

router.delete(
  '/sync/jobs',
  emailController.deleteAllSyncJobs
);

router.get(
  '/sync/:syncJobId/results',
  [
    param('syncJobId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid sync job ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.getSyncJobResults
);

// Extracted Emails Routes
router.get(
  '/emails/extracted',
  emailController.getExtractedEmails
);

router.get(
  '/emails/extracted/:accountId',
  [
    param('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
  ],
  validateRequest,
  emailController.getExtractedEmails
);

// Export Routes
router.post(
  '/export',
  [
    body('accountId').custom((value) => {
      // Accept both MongoDB ObjectId and UUID formats
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
      if (!isMongoId && !isUUID) {
        throw new Error('Valid account ID is required');
      }
      return true;
    }),
    body('format').isIn(['csv', 'json', 'xlsx']).withMessage('Valid export format is required'),
    body('filters').optional().isObject().withMessage('Filters must be an object'),
  ],
  validateRequest,
  emailController.exportEmails
);

// Token Routes
router.get('/tokens/packages', tokenController.getTokenPackages);
router.get('/tokens/balance', tokenController.getUserTokenBalance);
router.post('/tokens/check-balance', [
  body('actionType').isIn(['EMAIL_FETCH', 'CONNECTION_TEST']).withMessage('Valid action type is required'),
], validateRequest, tokenController.checkTokenBalance);
router.get('/tokens/transactions', tokenController.getTokenTransactions);
router.get('/tokens/purchases', tokenController.getPurchaseHistory);
router.post('/tokens/calculate-cost', [
  body('emailCount').isInt({ min: 0 }).withMessage('Valid email count is required'),
], validateRequest, tokenController.calculateSyncCost);
router.post('/tokens/purchase', [
  body('packageId').isString().withMessage('Package ID is required'),
  body('currency').isString().withMessage('Currency is required'),
], validateRequest, tokenController.initiatePurchase);

// Admin/Testing Routes for Tokens
router.post('/tokens/deduct', [
  body('actionType').isIn(['EMAIL_FETCH', 'CONNECTION_TEST']).withMessage('Valid action type is required'),
  body('description').optional().isString(),
], validateRequest, tokenController.deductTokens);
router.post('/tokens/add', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('cubes').isInt({ min: 1 }).withMessage('Valid cube amount is required'),
  body('reason').optional().isString(),
], validateRequest, tokenController.addTokens);

// Super Admin Routes (requires super admin privileges)
router.get('/admin/users', requireSuperAdmin, superAdminController.getAllUsers);
router.get('/admin/users/:userId', requireSuperAdmin, superAdminController.getUserDetails);
router.get('/admin/statistics', requireSuperAdmin, superAdminController.getUserStatistics);
router.post('/admin/credits/add', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('cubes').isInt({ min: 1 }).withMessage('Valid cube amount is required'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
], validateRequest, requireSuperAdmin, superAdminController.addCredits);
router.post('/admin/credits/deduct', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('cubes').isInt({ min: 1 }).withMessage('Valid cube amount is required'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
], validateRequest, requireSuperAdmin, superAdminController.deductCredits);
router.get('/admin/audit-logs', requireSuperAdmin, superAdminController.getAuditLogs);

export default router;
