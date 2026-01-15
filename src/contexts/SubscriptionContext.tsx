import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserSubscription as fetchUserSubscription } from '@/lib/api';

export type PlanType = 'community' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending';

export interface PlanLimits {
  maxEmailAccounts: number;
  unmaskedEmails: boolean;
  prioritySupport: boolean;
  advancedExports: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customIntegrations: boolean;
  dedicatedSupport: boolean;
}

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

export interface SubscriptionContextType {
  subscription: Subscription | null;
  planLimits: PlanLimits;
  isLoading: boolean;
  error: string | null;
  
  // Plan checking functions
  canAddEmailAccount: () => boolean;
  canAccessFeature: (feature: keyof PlanLimits) => boolean;
  shouldMaskEmails: () => boolean;
  getUsageInfo: () => Promise<UsageInfo>;
  
  // Subscription management
  upgradePlan: (planType: PlanType) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  resumeSubscription: () => Promise<void>;
  
  // Refresh data
  refreshSubscription: () => Promise<void>;
}

export interface UsageInfo {
  emailAccountsUsed: number;
  emailAccountsLimit: number;
  currentPlan: PlanType;
  isAtLimit: boolean;
}

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  community: {
    maxEmailAccounts: 3, // Free tier allows 3 email accounts
    unmaskedEmails: false,
    prioritySupport: false,
    advancedExports: false,
    apiAccess: false,
    whiteLabel: false,
    customIntegrations: false,
    dedicatedSupport: false,
  },
  professional: {
    maxEmailAccounts: 10, // Pro tier allows 10 email accounts
    unmaskedEmails: true,
    prioritySupport: true,
    advancedExports: true,
    apiAccess: true,
    whiteLabel: false,
    customIntegrations: false,
    dedicatedSupport: false,
  },
  enterprise: {
    maxEmailAccounts: Infinity, // Enterprise tier allows unlimited email accounts
    unmaskedEmails: true,
    prioritySupport: true,
    advancedExports: true,
    apiAccess: true,
    whiteLabel: true,
    customIntegrations: true,
    dedicatedSupport: true,
  },
};

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailAccountCount, setEmailAccountCount] = useState(0);

  // Get current plan limits
  const currentPlan = subscription?.planType || 'community';
  const planLimits = PLAN_LIMITS[currentPlan];

  // Load subscription data
  const loadSubscription = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch subscription data from API
      const result = await fetchUserSubscription();

      // Set subscription data (will be null for community plan)
      if (result.subscription) {
        setSubscription({
          id: result.subscription.id,
          userId: result.subscription.userId,
          planType: result.subscription.planType,
          status: result.subscription.status,
          currentPeriodStart: new Date(result.subscription.currentPeriodStart),
          currentPeriodEnd: new Date(result.subscription.currentPeriodEnd),
          cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd,
          paymentMethodId: result.subscription.paymentMethodId,
          lastPaymentDate: result.subscription.lastPaymentDate ? new Date(result.subscription.lastPaymentDate) : undefined,
          nextPaymentDate: result.subscription.nextPaymentDate ? new Date(result.subscription.nextPaymentDate) : undefined,
          createdAt: new Date(result.subscription.createdAt),
          updatedAt: new Date(result.subscription.updatedAt),
        });
      } else {
        // Default to community plan if no active subscription
        setSubscription({
          id: 'community_' + user.id,
          userId: user.id,
          planType: 'community',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Set email account count from usage stats
      if (result.usageStats) {
        setEmailAccountCount(result.usageStats.emailAccountsCount || 0);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      console.error('Error loading subscription:', err);
      
      // Fallback to community plan on error
      setSubscription({
        id: 'fallback_' + user.id,
        userId: user.id,
        planType: 'community',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load subscription on user change
  useEffect(() => {
    loadSubscription();
  }, [user?.id]);

  // Listen for subscription refresh events (triggered after user initialization)
  useEffect(() => {
    const handleSubscriptionRefresh = () => {
      console.log('Subscription refresh triggered');
      loadSubscription();
    };

    window.addEventListener('subscription-refresh', handleSubscriptionRefresh);
    
    return () => {
      window.removeEventListener('subscription-refresh', handleSubscriptionRefresh);
    };
  }, []);

  // Plan checking functions
  const canAddEmailAccount = (): boolean => {
    // Account limits removed - always allow adding accounts
    return true;
  };

  const canAccessFeature = (feature: keyof PlanLimits): boolean => {
    return Boolean(planLimits[feature]);
  };

  const shouldMaskEmails = (): boolean => {
    const shouldMask = !planLimits.unmaskedEmails;
    
    // Debug logging to help troubleshoot masking issues
    console.log('Email masking check:', {
      currentPlan,
      planLimits,
      unmaskedEmails: planLimits.unmaskedEmails,
      shouldMask,
      subscription
    });
    
    return shouldMask;
  };

  const getUsageInfo = async (): Promise<UsageInfo> => {
    // TODO: Fetch real-time usage data from API
    return {
      emailAccountsUsed: emailAccountCount,
      emailAccountsLimit: planLimits.maxEmailAccounts,
      currentPlan,
      isAtLimit: !canAddEmailAccount(),
    };
  };

  // Subscription management
  const upgradePlan = async (planType: PlanType): Promise<void> => {
    if (!user?.id) throw new Error('User not authenticated');

    try {
      setError(null);
      
      const response = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planType }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to upgrade plan');
      }

      // Update local subscription state
      if (result.subscription) {
        setSubscription({
          id: result.subscription.id,
          userId: result.subscription.userId,
          planType: result.subscription.planType,
          status: result.subscription.status,
          currentPeriodStart: new Date(result.subscription.currentPeriodStart),
          currentPeriodEnd: new Date(result.subscription.currentPeriodEnd),
          cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd,
          paymentMethodId: result.subscription.paymentMethodId,
          lastPaymentDate: result.subscription.lastPaymentDate ? new Date(result.subscription.lastPaymentDate) : undefined,
          nextPaymentDate: result.subscription.nextPaymentDate ? new Date(result.subscription.nextPaymentDate) : undefined,
          createdAt: new Date(result.subscription.createdAt),
          updatedAt: new Date(result.subscription.updatedAt),
        });
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade plan');
      throw err;
    }
  };

  const cancelSubscription = async (): Promise<void> => {
    if (!subscription) throw new Error('No active subscription');

    try {
      setError(null);
      
      // TODO: Implement actual cancellation logic
      console.log('Cancelling subscription:', subscription.id);
      
      setSubscription({
        ...subscription,
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
      throw err;
    }
  };

  const resumeSubscription = async (): Promise<void> => {
    if (!subscription) throw new Error('No subscription to resume');

    try {
      setError(null);
      
      // TODO: Implement actual resume logic
      console.log('Resuming subscription:', subscription.id);
      
      setSubscription({
        ...subscription,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume subscription');
      throw err;
    }
  };

  const refreshSubscription = async (): Promise<void> => {
    await loadSubscription();
  };

  const contextValue: SubscriptionContextType = {
    subscription,
    planLimits,
    isLoading,
    error,
    canAddEmailAccount,
    canAccessFeature,
    shouldMaskEmails,
    getUsageInfo,
    upgradePlan,
    cancelSubscription,
    resumeSubscription,
    refreshSubscription,
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// Custom hooks for common use cases
export function usePlanLimits() {
  const { planLimits } = useSubscription();
  return planLimits;
}

export function useCanAddEmailAccount() {
  const { canAddEmailAccount } = useSubscription();
  return canAddEmailAccount();
}

export function useShouldMaskEmails() {
  const { shouldMaskEmails } = useSubscription();
  return shouldMaskEmails();
}