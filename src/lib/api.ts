import { EmailAccount } from "@/types/email";
import { Proxy } from "@/types/proxy";
import { supabase } from "./supabase";

export const API_BASE_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.origin.includes('railway.app') 
    ? '/api'  // Use relative URL for Railway production
    : "http://localhost:3001/api"  // Use localhost for development
);

export const getAuthHeaders = async () => {
  // Get the current session without refreshing (to avoid infinite loops)
  const { data: { session }, error } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Debug logging
  console.log('Getting auth headers:', {
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
    userEmail: session?.user?.email,
    error: error?.message
  });

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
    console.log('Added auth header with token:', session.access_token.substring(0, 20) + '...');
  } else {
    console.warn('No session or access token found for API call');
  }
  
  return headers;
};

/**
 * Fetches all email accounts from the backend.
 */
export const getEmailAccounts = async (): Promise<EmailAccount[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch accounts');
  }
  const result = await response.json();
  return result.data;
};

/**
 * Represents the payload for adding a new email account.
 */
export interface AddAccountPayload {
  email: string;
  provider: 'IMAP' | 'POP3' | 'Exchange' | 'outlook_oauth' | 'office365_oauth' | 'office365_cookies';
  proxyId?: string;
  auth: {
    // Traditional email authentication
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string; // Changed from username to match backend expectations
    pass?: string; // Changed from password to match backend expectations

    // OAuth2 authentication
    type?: string; // OAuth type identifier
    accessToken?: string; // For OAuth2
    refreshToken?: string; // For OAuth2 token refresh
    expiresOn?: string; // For OAuth2 token expiry
    email?: string; // For OAuth2 user identification

    // Cookie-based authentication
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expirationDate?: number;
      httpOnly?: boolean;
      hostOnly?: boolean;
    }>;
  };
}

/**
 * Tests and saves a new email account connection.
 * @param payload - The account details.
 * @returns The newly created account.
 */
export const addEmailAccount = async (payload: AddAccountPayload, signal?: AbortSignal): Promise<EmailAccount> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal, // Pass abort signal to fetch
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to add account');
  }

  const result = await response.json();
  return result.data;
};

export const listFolders = async (accountId: string): Promise<any[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/folders`, { headers });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to list folders');
  }
  const result = await response.json();
  return result.data;
};

export const deleteEmailAccount = async (accountId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete account');
  }
};

export const deleteAllEmailAccounts = async (): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete all accounts');
  }
};

// Get user's token balance
export const getTokenBalance = async (): Promise<{ balance: number; totalPurchased: number; totalConsumed: number }> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/tokens/balance`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch token balance');
  }

  const data = await response.json();
  return data.tokenBalance;
};

export const startSync = async (accountId: string, folders: string[], name?: string, proxyId?: string): Promise<{ syncJobId: string }> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      accountId, 
      folders, 
      name: name || `Crawl job ${new Date().toISOString()}`,
      proxyId 
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to start sync');
  }
  const result = await response.json();
  // Backend returns { success: true, message: string, syncJobId: string }
  return { syncJobId: result.syncJobId };
};

export const stopSync = async (syncId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/stop`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ syncId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || 'Failed to stop sync');
  }
};

export const getSyncJobs = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/jobs`, { headers });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch crawl jobs');
  }
  const data = await response.json();
  return data.data;
};

// Direct Supabase query for sync jobs (Pure Realtime approach)
export const getSyncJobsDirect = async () => {
  try {
    const { data, error } = await supabase
      .from('sync_jobs')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Supabase getSyncJobsDirect error:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    console.log('getSyncJobsDirect success:', data?.length || 0, 'jobs found');
    return data || [];
  } catch (error) {
    console.error('getSyncJobsDirect failed:', error);
    throw error;
  }
};

export const deleteSyncJob = async (syncJobId: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/jobs/${syncJobId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete crawl job');
  }
  const data = await response.json();
  return data;
};

export const deleteAllSyncJobs = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/jobs`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete all crawl jobs');
  }
  const data = await response.json();
  return data;
};

export const getJobResults = async (jobId: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/${jobId}/results`, { headers });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch job results');
  }
  const data = await response.json();
  return data.data;
};

export const getSyncJobResults = async (syncJobId: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sync/${syncJobId}/results`, { headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})); // Handle cases where body is not JSON
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }
  const result = await response.json();
  return result.data; // This will be { status: string, results: any[] }
};


export const getProxies = async (): Promise<Proxy[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/proxies`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch proxies');
  }
  const result = await response.json();
  return result.data;
};

// Proxy testing API
export interface ProxyTestResponse {
  success: boolean;
  responseTime?: number;
  error?: string;
  message: string;
}

export const testProxyConnection = async (proxyId: string): Promise<ProxyTestResponse> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/proxies/${proxyId}/test`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to test proxy connection');
  }

  return response.json();
};

// Add proxy
export const addProxy = async (proxy: {
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  username?: string;
  password?: string;
}): Promise<Proxy> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/proxies`, {
    method: 'POST',
    headers,
    body: JSON.stringify(proxy),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to add proxy');
  }

  const result = await response.json();
  return result.data;
};

// Edit proxy
export const editProxy = async (proxyId: string, proxy: {
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  username?: string;
  password?: string;
}): Promise<Proxy> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/proxies/${proxyId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(proxy),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to update proxy');
  }

  const result = await response.json();
  return result.data;
};

// Delete proxy
export const deleteProxy = async (proxyId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/proxies/${proxyId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete proxy');
  }
};

// Auto-detection API
export interface AutoDetectRequest {
  email: string;
  password: string;
  proxyId?: string;
  operationId?: string;
}

export interface AutoDetectResponse {
  success: boolean;
  message?: string;
  data?: {
    email: string;
    provider: {
      name: string;
      type: 'IMAP' | 'POP3' | 'Exchange';
      host: string;
      port: number;
      secure: boolean;
    };
    auth: {
      user: string;
    };
  };
  meta?: {
    providerName: string;
    testedConfigurations: number;
  };
  error?: string;
}

// OAuth2 API
export interface OAuthInitRequest {
  email: string;
}

export interface OAuthInitResponse {
  success: boolean;
  authUrl: string;
  state: string;
  message: string;
}

/**
 * Initialize Microsoft OAuth2 flow
 */
export const initiateMicrosoftOAuth = async (request: OAuthInitRequest): Promise<OAuthInitResponse> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/auth/microsoft/init`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to initiate OAuth');
  }

  return response.json();
};

/**
 * Add email account with OAuth2 tokens
 */
export const addOAuthAccount = async (payload: {
  email: string;
  provider: 'outlook' | 'office365';
  accessToken: string;
  refreshToken?: string;
  expiresOn: string;
  proxyId?: string;
}): Promise<EmailAccount> => {
  const providerType = payload.provider === 'outlook' ? 'outlook_oauth' : 'office365_oauth';

  const accountPayload: AddAccountPayload = {
    email: payload.email,
    provider: providerType,
    auth: {
      type: providerType,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresOn: payload.expiresOn,
      email: payload.email,
    },
    proxyId: payload.proxyId,
  };

  return addEmailAccount(accountPayload);
};

/**
 * Add Office365 account with cookies
 */
export const addOffice365CookieAccount = async (payload: {
  email: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expirationDate?: number;
    httpOnly?: boolean;
    hostOnly?: boolean;
  }>;
  proxyId?: string;
}): Promise<EmailAccount> => {
  const accountPayload: AddAccountPayload = {
    email: payload.email,
    provider: 'office365_cookies',
    auth: {
      type: 'office365_cookies',
      cookies: payload.cookies,
      email: payload.email,
    },
    proxyId: payload.proxyId,
  };

  return addEmailAccount(accountPayload);
};

export const autoDetectEmailSettings = async (request: AutoDetectRequest & { operationId?: string }, signal?: AbortSignal): Promise<AutoDetectResponse> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts/auto-detect`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal, // Pass abort signal to fetch
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || 'Auto-detection failed');
  }
  
  return result;
};

// Backend cancellation API
export const cancelBulkOperations = async (sessionId: string): Promise<{ success: boolean; cancelledCount: number }> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/accounts/cancel-bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to cancel bulk operations');
  }
  
  return response.json();
};

// Billing API functions
export interface SubscriptionResponse {
  subscription: any;
  usageStats: any;
  subscriptionStatus: any;
  success: boolean;
}

export const getUserSubscription = async (): Promise<SubscriptionResponse> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/billing/subscription`, { headers });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch subscription');
  }
  
  return response.json();
};

export const getPlans = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/billing/plans`, { headers });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch plans');
  }
  
  return response.json();
};

export const checkAccountLimit = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/billing/account-limit`, { headers });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to check account limit');
  }
  
  return response.json();
};

export const checkEmailMasking = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/billing/email-masking`, { headers });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to check email masking status');
  }
  
  return response.json();
};
