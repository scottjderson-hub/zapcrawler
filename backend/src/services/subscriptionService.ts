import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export type PlanType = 'community' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending' | 'trial';

export interface Subscription {
  id: string;
  userId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  paymentMethodId?: string;
  lastPaymentDate?: Date;
  nextPaymentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanConfiguration {
  planType: PlanType;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  maxEmailAccounts: number | null;
  unmaskedEmails: boolean;
  prioritySupport: boolean;
  advancedExports: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customIntegrations: boolean;
  dedicatedSupport: boolean;
}

export interface UsageStats {
  userId: string;
  emailAccountsCount: number;
  activeCrawlJobs: number;
  totalEmailsCrawled: number;
  dailyApiCalls: number;
  monthlyApiCalls: number;
  lastApiCall?: Date;
}

export class SubscriptionService {
  /**
   * Get user's current active subscription
   */
  static async getUserSubscription(userId: string): Promise<Subscription | null> {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No active subscription found
          return null;
        }
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        planType: data.plan_type,
        status: data.status,
        currentPeriodStart: new Date(data.current_period_start),
        currentPeriodEnd: new Date(data.current_period_end),
        cancelAtPeriodEnd: data.cancel_at_period_end,
        paymentMethodId: data.payment_method_id,
        lastPaymentDate: data.last_payment_date ? new Date(data.last_payment_date) : undefined,
        nextPaymentDate: data.next_payment_date ? new Date(data.next_payment_date) : undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      logger.error('Error fetching user subscription:', error);
      throw new Error('Failed to fetch subscription');
    }
  }

  /**
   * Get all available plan configurations
   */
  static async getPlanConfigurations(): Promise<PlanConfiguration[]> {
    try {
      const { data, error } = await supabase
        .from('plan_configurations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        throw error;
      }

      return data.map((plan: any) => ({
        planType: plan.plan_type,
        name: plan.name,
        description: plan.description,
        priceMonthly: Number(plan.price_monthly),
        priceYearly: Number(plan.price_yearly),
        maxEmailAccounts: plan.max_email_accounts,
        unmaskedEmails: plan.unmasked_emails,
        prioritySupport: plan.priority_support,
        advancedExports: plan.advanced_exports,
        apiAccess: plan.api_access,
        whiteLabel: plan.white_label,
        customIntegrations: plan.custom_integrations,
        dedicatedSupport: plan.dedicated_support,
      }));
    } catch (error) {
      logger.error('Error fetching plan configurations:', error);
      throw new Error('Failed to fetch plan configurations');
    }
  }

  /**
   * Get user's usage statistics
   */
  static async getUserUsageStats(userId: string): Promise<UsageStats | null> {
    try {
      const { data, error } = await supabase
        .from('user_usage_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No usage stats found, return default
          return {
            userId,
            emailAccountsCount: 0,
            activeCrawlJobs: 0,
            totalEmailsCrawled: 0,
            dailyApiCalls: 0,
            monthlyApiCalls: 0,
          };
        }
        throw error;
      }

      return {
        userId: data.user_id,
        emailAccountsCount: data.email_accounts_count,
        activeCrawlJobs: data.active_crawl_jobs,
        totalEmailsCrawled: data.total_emails_crawled,
        dailyApiCalls: data.daily_api_calls,
        monthlyApiCalls: data.monthly_api_calls,
        lastApiCall: data.last_api_call ? new Date(data.last_api_call) : undefined,
      };
    } catch (error) {
      logger.error('Error fetching user usage stats:', error);
      throw new Error('Failed to fetch usage statistics');
    }
  }

  /**
   * Check if user can add more email accounts based on their plan
   */
  static async canUserAddEmailAccount(userId: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const usageStats = await this.getUserUsageStats(userId);
      
      if (!subscription || !usageStats) {
        return false;
      }

      const plans = await this.getPlanConfigurations();
      const currentPlan = plans.find(p => p.planType === subscription.planType);
      
      if (!currentPlan) {
        return false;
      }

      // Unlimited accounts
      if (currentPlan.maxEmailAccounts === null) {
        return true;
      }

      return usageStats.emailAccountsCount < currentPlan.maxEmailAccounts;
    } catch (error) {
      logger.error('Error checking email account limit:', error);
      return false;
    }
  }

  /**
   * Check if user should have emails masked
   */
  static async shouldMaskEmailsForUser(userId: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription) {
        return true; // Default to masking for safety
      }

      const plans = await this.getPlanConfigurations();
      const currentPlan = plans.find(p => p.planType === subscription.planType);
      
      return !currentPlan?.unmaskedEmails;
    } catch (error) {
      logger.error('Error checking email masking status:', error);
      return true; // Default to masking for safety
    }
  }

  /**
   * Create or update user subscription
   */
  static async updateUserSubscription(
    userId: string, 
    planType: PlanType,
    paymentTransactionId?: string
  ): Promise<Subscription> {
    try {
      // First, cancel any existing active subscriptions
      await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'active');

      // Create new subscription
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month from now

      const { data, error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_type: planType,
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`User ${userId} upgraded to ${planType} plan`);

      return {
        id: data.id,
        userId: data.user_id,
        planType: data.plan_type,
        status: data.status,
        currentPeriodStart: new Date(data.current_period_start),
        currentPeriodEnd: new Date(data.current_period_end),
        cancelAtPeriodEnd: data.cancel_at_period_end,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      logger.error('Error updating user subscription:', error);
      throw new Error('Failed to update subscription');
    }
  }

  /**
   * Cancel user subscription at period end
   */
  static async cancelUserSubscription(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ 
          cancel_at_period_end: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        throw error;
      }

      logger.info(`User ${userId} subscription marked for cancellation`);
    } catch (error) {
      logger.error('Error cancelling user subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Resume cancelled subscription
   */
  static async resumeUserSubscription(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ 
          cancel_at_period_end: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        throw error;
      }

      logger.info(`User ${userId} subscription resumed`);
    } catch (error) {
      logger.error('Error resuming user subscription:', error);
      throw new Error('Failed to resume subscription');
    }
  }

  /**
   * Get comprehensive user subscription status with limits
   */
  static async getUserSubscriptionStatus(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_subscription_status')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        throw error;
      }

      return {
        userId: data.user_id,
        email: data.email,
        planType: data.plan_type || 'community',
        subscriptionStatus: data.subscription_status || 'active',
        currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        planName: data.plan_name,
        maxEmailAccounts: data.max_email_accounts,
        unmaskedEmails: data.unmasked_emails || false,
        prioritySupport: data.priority_support || false,
        advancedExports: data.advanced_exports || false,
        apiAccess: data.api_access || false,
        emailAccountsCount: data.email_accounts_count || 0,
        atAccountLimit: data.at_account_limit || false,
      };
    } catch (error) {
      logger.error('Error fetching user subscription status:', error);
      
      // Return default community plan status if error
      return {
        userId,
        email: '',
        planType: 'community' as PlanType,
        subscriptionStatus: 'active' as SubscriptionStatus,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        planName: 'Community',
        maxEmailAccounts: null,
        unmaskedEmails: false,
        prioritySupport: false,
        advancedExports: false,
        apiAccess: false,
        emailAccountsCount: 0,
        atAccountLimit: false,
      };
    }
  }

  /**
   * Update user usage stats
   */
  static async updateUsageStats(userId: string, updates: Partial<UsageStats>): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_usage_stats')
        .upsert({
          user_id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Error updating usage stats:', error);
      throw new Error('Failed to update usage statistics');
    }
  }

  /**
   * Increment email accounts count
   */
  static async incrementEmailAccountCount(userId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_email_account_count', {
        user_id_param: userId
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Error incrementing email account count:', error);
      // Don't throw error, this is not critical
    }
  }

  /**
   * Check if user has reached their account limit
   * Note: Account limits have been removed - always allows account addition
   */
  static async checkAccountLimit(userId: string): Promise<{ canAdd: boolean; limit: number | null; current: number }> {
    try {
      const status = await this.getUserSubscriptionStatus(userId);

      return {
        canAdd: true, // Account limits removed - always allow account addition
        limit: null, // No limits enforced
        current: status.emailAccountsCount,
      };
    } catch (error) {
      logger.error('Error checking account limit:', error);
      return { canAdd: true, limit: null, current: 0 }; // Default to allowing account addition
    }
  }
}