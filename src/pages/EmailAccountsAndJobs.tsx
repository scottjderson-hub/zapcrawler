import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getEmailAccounts, 
  addEmailAccount, 
  AddAccountPayload, 
  deleteEmailAccount, 
  deleteAllEmailAccounts, 
  getProxies,
  getSyncJobs,
  getJobResults,
  startSync,
  stopSync,
  deleteSyncJob,
  deleteAllSyncJobs,
  autoDetectEmailSettings,
  AutoDetectRequest,
  testProxyConnection,
  ProxyTestResponse,
  addOAuthAccount,
  addOffice365CookieAccount
} from "@/lib/api";
import { providerPresets } from "@/lib/provider-presets";
import ResultsDisplay from '@/components/ResultsDisplay';
import { useWebSocketContext } from '@/contexts/SupabaseRealtimeContext';
import { toast } from "sonner";
import { 
  Plus, 
  Mail, 
  Check, 
  X, 
  Settings, 
  Trash2, 
  Play,
  Eye,
  Download,
  FileText,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  StopCircle,
  RefreshCw,
  Users,
  PlayCircle,
  Upload,
  FileUp,
  Shield,
  Crown,
  Zap,
  CreditCard,
  Smartphone,
  Lock,
  Coins
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FolderSelectionModal } from "../components/FolderSelectionModal";
import { BulkAddManager } from "../components/BulkAddManager";
import { MicrosoftOAuthConnect } from "../components/MicrosoftOAuthConnect";
import { Office365CookieModal } from "../components/Office365CookieModal";
import { Textarea } from "@/components/ui/textarea";
import { useSubscription } from "../contexts/SubscriptionContext";
import { maskEmailArrayPartialTokens } from "../utils/emailMasking";
import { supabase } from "@/lib/supabase";
import { getTokenBalance } from "@/lib/api";

const initialFormState = {
  provider: "",
  email: "",
  password: "",
  server: "",
  port: "",
  security: "ssl",
  proxyId: "no-proxy", // Default to no proxy
};


export default function EmailAccountsAndJobs() {
  const queryClient = useQueryClient();
  const { canAddEmailAccount, planLimits, subscription } = useSubscription();
  
  // Account management state
  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);
  const [protocol, setProtocol] = useState<'IMAP' | 'POP3'>('POP3');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  
  // Job management state
  const [isCreateJobDialogOpen, setIsCreateJobDialogOpen] = useState(false);
  const [jobName, setJobName] = useState("");
  const [selectedJobAccountId, setSelectedJobAccountId] = useState<string | null>(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [selectedJobResults, setSelectedJobResults] = useState<{ status: string; results: any[] } | null>(null);
  const [selectedJobName, setSelectedJobName] = useState("");
  const [selectedJob, setSelectedJob] = useState<any>(null);
  
  // Payment/Upgrade state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [selectedTokenAmount, setSelectedTokenAmount] = useState<number>(0);
  
  // Batch sync state
  const [isBatchSyncDialogOpen, setIsBatchSyncDialogOpen] = useState(false);
  const [batchJobName, setBatchJobName] = useState("");
  const [currentBatchSyncJobId, setCurrentBatchSyncJobId] = useState<string | null>(null);
  const [batchSyncProgress, setBatchSyncProgress] = useState<any>(null);
  const [isBatchResultsModalOpen, setIsBatchResultsModalOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<any>(null);
  
  // Bulk add state
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  // OAuth2 state
  const [isOAuthDialogOpen, setIsOAuthDialogOpen] = useState(false);
  const [oauthEmail, setOauthEmail] = useState("");


  // Auto-detection state
  const [isQuickAddDialogOpen, setIsQuickAddDialogOpen] = useState(false);
  const [quickAddEmail, setQuickAddEmail] = useState("");
  const [quickAddPassword, setQuickAddPassword] = useState("");
  const [quickAddProxyId, setQuickAddProxyId] = useState("no-proxy");
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<string>('');
  const [useManualSettings, setUseManualSettings] = useState(false);
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("993");
  const [manualSecure, setManualSecure] = useState(true);

  // Sync state
  const [currentSyncJobId, setCurrentSyncJobId] = useState<string | null>(null);
  
  // Delete confirmation modal state
  const [isDeleteJobModalOpen, setIsDeleteJobModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<any>(null);
  const [isDeleteAllJobsModalOpen, setIsDeleteAllJobsModalOpen] = useState(false);
  
  // Proxy testing state
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);

  // Optimized data queries with parallel loading and better caching
  const { data: accounts = [], isLoading: isLoadingAccounts, error: accountsError } = useQuery({ 
    queryKey: ["emailAccounts"], 
    queryFn: getEmailAccounts,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes (renamed from cacheTime)
    retry: 2,
    retryDelay: 1000
  });
  
  const { data: proxies = [], isLoading: isLoadingProxies, error: proxiesError } = useQuery({ 
    queryKey: ['proxies'], 
    queryFn: getProxies,
    staleTime: 60000, // 1 minute (proxies change less frequently)
    gcTime: 600000, // 10 minutes (renamed from cacheTime)
    retry: 2,
    retryDelay: 1000
  });
  
  const { data: jobs = [], isLoading: isLoadingJobs, error: jobsError } = useQuery({
    queryKey: ['syncJobs'],
    queryFn: getSyncJobs, // Use same simple approach as Dashboard
    // Removed polling to prevent rate limiting on Railway
  });
  
  // Lightweight realtime listener for email count updates only
  useEffect(() => {
    console.log('Setting up Supabase realtime listener for email counts...');
    
    const channel = supabase
      .channel('email-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events first to debug
          schema: 'public',
          table: 'sync_jobs'
        },
        (payload) => {
          console.log('📧 Realtime sync_jobs change:', payload);
          
          // Only update email counts for UPDATE events with current_count changes
          if (payload.eventType === 'UPDATE' && payload.new && payload.new.id && payload.new.current_count !== payload.old?.current_count) {
            console.log('📊 Updating email count for job:', payload.new.id, 'new count:', payload.new.current_count);
            
            queryClient.setQueryData(['syncJobs'], (oldData: any[]) => {
              if (!Array.isArray(oldData)) {
                console.log('❌ Invalid oldData, not an array:', oldData);
                return oldData;
              }
              
              const updated = oldData.map(job => 
                job.id === payload.new.id 
                  ? { ...job, current_count: payload.new.current_count }
                  : job
              );
              
              console.log('✅ Updated jobs data with new email count');
              return updated;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 Email count realtime subscription status:', status);
      });

    return () => {
      console.log('🧹 Cleaning up Supabase realtime listener');
      supabase.removeChannel(channel);
    };
  }, []); // Remove queryClient dependency to prevent re-renders

  // Additional listener for custom sync progress broadcasts
  useEffect(() => {
    let progressChannel: any = null;

    const setupProgressListener = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const channelName = `sync-progress-${user.id}`;
          console.log('📡 Setting up sync progress listener on channel:', channelName);

          progressChannel = supabase
            .channel(channelName)
            .on('broadcast', { event: 'progress-update' }, (payload) => {
              console.log('📈 Received sync progress update:', payload);

              // Update the specific job's current count immediately
              queryClient.setQueryData(['syncJobs'], (oldData: any[]) => {
                if (!Array.isArray(oldData)) {
                  return oldData;
                }

                return oldData.map(job => {
                  if (job.id === payload.payload.syncJobId) {
                    const message = payload.payload.message || '';
                    const progress = payload.payload.progress || job.progress;

                    // Handle completion message: "Sync complete: X unique emails found"
                    const completionMatch = message.match(/Sync complete: (\d+) unique emails found/);
                    if (completionMatch) {
                      // Force a full job refresh to get the latest token information from the database
                      setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
                      }, 1000); // Small delay to ensure database is updated

                      return {
                        ...job,
                        status: 'completed',
                        progress: 100,
                        result_count: parseInt(completionMatch[1]),
                        email_count: parseInt(completionMatch[1])
                      };
                    }

                    // Handle progress message: "Processed X messages"
                    const progressMatch = message.match(/Processed (\d+) messages/);
                    if (progressMatch) {
                      return {
                        ...job,
                        current_count: parseInt(progressMatch[1]),
                        progress: progress
                      };
                    }

                    // Fallback: update progress only
                    return {
                      ...job,
                      progress: progress
                    };
                  }
                  return job;
                });
              });
            })
            .subscribe((status) => {
              console.log('🔌 Progress channel subscription status:', status);
            });
        }
      } catch (error) {
        console.error('Error setting up sync progress listener:', error);
      }
    };

    setupProgressListener();

    return () => {
      if (progressChannel) {
        console.log('🧹 Cleaning up sync progress listener');
        supabase.removeChannel(progressChannel);
      }
    };
  }, [queryClient]);

  // Using simple API approach for job list with realtime email counts

  // Combined loading state for better UX
  const isInitialLoading = isLoadingAccounts || isLoadingProxies || isLoadingJobs;
  const hasErrors = accountsError || proxiesError || jobsError;

  // Debug logging for jobs state
  useEffect(() => {
    console.log('Jobs state changed:', {
      jobsCount: jobs.length,
      isLoadingJobs,
      jobsError: jobsError?.message,
      jobs: jobs.map(job => ({ id: job.id, status: job.status, name: job.name }))
    });
  }, [jobs, isLoadingJobs, jobsError]);

  // Effect to update form when protocol changes
  useEffect(() => {
    if (formState.provider) {
      handleProviderChange(formState.provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol]);

  // Use WebSocket context for real-time updates
  const { lastMessage } = useWebSocketContext();
  
  // Handle WebSocket messages for account updates
  useEffect(() => {
    // Handle account status updates (these come as raw WebSocket messages, not SyncProgressEvents)
    if (lastMessage && typeof lastMessage === 'object' && 'type' in lastMessage) {
      const message = lastMessage as any;
      if (message.type === 'ACCOUNT_STATUS_UPDATED' && message.payload) {
        const updatedAccount = message.payload;
        queryClient.setQueryData(['emailAccounts'], (oldData: any) => {
          if (!oldData) return [];
          return oldData.map((account: any) => 
            (account.id || account._id) === (updatedAccount.id || updatedAccount._id) ? { ...account, ...updatedAccount } : account
          );
        });
      }
    }
  }, [lastMessage, queryClient]);

  // Account management functions
  const handleOpenAddAccountDialog = (open: boolean) => {
    if (open) {
      setFormState(initialFormState);
      setProtocol('POP3');
    }
    setIsAddAccountDialogOpen(open);
  };

  const addAccountMutation = useMutation({
    mutationFn: addEmailAccount,
    onSuccess: () => {
      toast.success("Account added successfully!");
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
      setIsAddAccountDialogOpen(false);
      setFormState(initialFormState); // Reset form on success
    },
    onError: (error: any) => {
      console.error('Add account error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to add account';
      
      if (error.message) {
        if (error.message.includes('Command failed')) {
          errorMessage = 'Connection failed. Please check your email address, password, and server settings. For Comcast/Xfinity, ensure you\'re using an app-specific password if 2FA is enabled.';
        } else if (error.message.includes('authentication')) {
          errorMessage = 'Authentication failed. Please check your email address and password.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Connection timeout. Please check your server settings and network connection.';
        } else {
          errorMessage = `Failed to add account: ${error.message}`;
        }
      }
      
      toast.error(errorMessage);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteEmailAccount,
    onSuccess: () => {
      toast.success("Account deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
    },
    onError: (error) => {
      toast.error(`Failed to delete account: ${error.message}`);
    },
  });

  const deleteAllAccountsMutation = useMutation({
    mutationFn: deleteAllEmailAccounts,
    onSuccess: () => {
      toast.success("All accounts have been deleted.");
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
    },
    onError: (error) => {
      toast.error(`Failed to delete all accounts: ${error.message}`);
    },
  });

  // Auto-detection mutation
  const autoDetectMutation = useMutation({
    mutationFn: autoDetectEmailSettings,
    onSuccess: async (result) => {
      if (result.success && result.data) {
        setQuickAddStatus(`✅ IMAP detected using ${result.data.provider.name}`);
        toast.success(`Settings auto-detected using ${result.data.provider.name}!`);
        
        // Show connecting status
        setQuickAddStatus('🔗 Connecting to email server...');
        
        // Automatically add the account with detected settings
        const accountPayload: AddAccountPayload = {
          email: result.data.email,
          provider: result.data.provider.type,
          auth: {
            host: result.data.provider.host,
            port: result.data.provider.port,
            secure: result.data.provider.secure,
            user: result.data.auth.user,
            pass: quickAddPassword, // Use the password from the form
          },
          proxyId: quickAddProxyId !== 'no-proxy' ? quickAddProxyId : null, // Send proxy ID instead of full object
        };
        
        // Debug: Log the payload being sent
        console.log('🔍 Quick Add Debug - Frontend payload:', {
          email: accountPayload.email,
          provider: accountPayload.provider,
          passwordLength: quickAddPassword?.length || 0,
          proxyId: quickAddProxyId,
          finalProxyId: accountPayload.proxyId,
          authPassLength: accountPayload.auth.pass?.length || 0
        });
        
        // Add the account using the detected settings
        let folderProgressInterval: NodeJS.Timeout | null = null;
        
        try {
          // Show folder fetching with simulated progress
          setQuickAddStatus('📁 Fetching email folders (this may take 30-60 seconds)...');
          
          // Simulate folder count progress for better UX
          folderProgressInterval = setInterval(() => {
            const randomCount = Math.floor(Math.random() * 50) + 20; // Random between 20-70
            setQuickAddStatus(`📁 Fetching email folders... (${randomCount} found so far)`);
          }, 2000);
          
          const result = await addEmailAccount(accountPayload);
          
          // Clear interval on success
          if (folderProgressInterval) {
            clearInterval(folderProgressInterval);
            folderProgressInterval = null;
          }
          
          // Extract folder count from response if available
          const folderCount = result?.folderCount || 'unknown';
          setQuickAddStatus(`✅ Account added successfully! Total folders fetched: ${folderCount}`);
          toast.success(`Account added successfully! ${folderCount} folders fetched.`);
          queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
          
          // Reset form after short delay to show success status
          setTimeout(() => {
            setIsQuickAddDialogOpen(false);
            setQuickAddEmail("");
            setQuickAddPassword("");
            setQuickAddProxyId("no-proxy");
            setQuickAddStatus('');
          }, 1500);
        } catch (error: any) {
          // Clear interval on error to stop folder progress
          if (folderProgressInterval) {
            clearInterval(folderProgressInterval);
            folderProgressInterval = null;
          }
          
          // Extract meaningful error message from backend response
          let errorMessage = 'Unknown error occurred';
          
          if (error?.response?.data?.message) {
            // Backend returned structured error
            errorMessage = error.response.data.message;
          } else if (error?.message) {
            // Extract specific error from message
            const message = error.message;
            
            // Look for authentication failure patterns
            if (message.includes('AUTHENTICATIONFAILED')) {
              const match = message.match(/\[AUTHENTICATIONFAILED\]\s*(.+?)(?:\s*\(|$)/);
              errorMessage = match ? match[1].trim() : 'Invalid credentials';
            }
            // Look for other IMAP error patterns
            else if (message.includes('Command failed')) {
              const match = message.match(/NO\s*\[?\w*\]?\s*(.+?)(?:\s*\(|$)/);
              errorMessage = match ? match[1].trim() : 'Connection failed';
            }
            // Look for connection errors
            else if (message.includes('ECONNREFUSED') || message.includes('connect ECONNREFUSED')) {
              errorMessage = 'Unable to connect to email server';
            }
            // Look for timeout errors
            else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
              errorMessage = 'Connection timed out';
            }
            // Look for proxy errors
            else if (message.includes('Socks5') || message.includes('proxy')) {
              errorMessage = 'Proxy connection failed';
            }
            // Use original message if no pattern matches
            else {
              errorMessage = message;
            }
          }
          
          setQuickAddStatus(`❌ Failed to add account: ${errorMessage}`);
          toast.error(`Failed to add account: ${errorMessage}`);
          setIsAutoDetecting(false);
        }
      }
    },
    onError: (error) => {
      setQuickAddStatus('❌ Auto-detection failed');
      toast.error(`Auto-detection failed: ${error.message}`);
      setIsAutoDetecting(false);
    },
    onSettled: () => {
      setIsAutoDetecting(false);
    },
  });

  const handleProviderChange = (providerName: string) => {
    const preset = providerPresets.find(p => p.name === providerName);
    if (preset) {
      setFormState(prev => ({
        ...prev,
        provider: providerName,
        server: preset.host,
        port: preset.port.toString(),
        security: preset.security,
      }));
    } else {
      setFormState(prev => ({ ...prev, provider: providerName }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleSecurityChange = (value: string) => {
    setFormState(prev => ({ ...prev, security: value }));
  };

  const handleProxyChange = (proxyId: string) => {
    setFormState(prev => ({ ...prev, proxyId }));
  };

  const handleAddAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Map provider display names to backend identifiers
    const getProviderIdentifier = (providerName: string): string => {
      const providerMap: Record<string, string> = {
        'Gmail': 'gmail',
        'Outlook/Hotmail': 'outlook',
        'Yahoo Mail': 'yahoo',
        'AOL Mail': 'imap',
        'iCloud Mail': 'imap',
        'Zoho Mail': 'imap',
        'ProtonMail': 'imap',
        'Fastmail': 'imap',
        'Mail.com': 'imap',
        'GMX': 'imap',
        'Yandex': 'imap',
        'Comcast/Xfinity': 'comcast',
        'Verizon': 'imap',
        'AT&T': 'imap',
        'Cox': 'imap',
        'Gmail POP3': 'pop3',
        'Outlook POP3': 'pop3',
        'Yahoo POP3': 'pop3',
        'Exchange Online': 'exchange'
      };
      return providerMap[providerName] || protocol.toLowerCase();
    };
    
    // Validate required fields
    if (!formState.password || formState.password.trim() === '') {
      toast.error('Please enter a password');
      return;
    }
    
    if (!formState.email || !formState.server || !formState.port) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Construct the payload with the correct structure
    const payload: AddAccountPayload = {
      email: formState.email,
      provider: getProviderIdentifier(formState.provider) as any,
      proxyId: formState.proxyId !== 'no-proxy' ? formState.proxyId : undefined, // Send only the ID, not the full object
      auth: {
        host: formState.server,
        port: parseInt(formState.port, 10),
        secure: formState.security === 'ssl',
        user: formState.email, // Use user instead of username to match backend expectations
        pass: formState.password, // Use pass instead of password to match backend expectations
      }
    };
    
    console.log('Proxy ID from form:', formState.proxyId);
    console.log('Payload being sent:', payload);
    
    addAccountMutation.mutate(payload);
  };

  // Quick Add handler for auto-detection
  const handleQuickAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!quickAddEmail || !quickAddPassword) {
      toast.error('Please enter both email and password');
      return;
    } 
    
    setIsAutoDetecting(true);
    setQuickAddStatus('🔍 Auto-detecting IMAP settings...');
    autoDetectMutation.mutate({
      email: quickAddEmail,
      password: quickAddPassword,
      proxyId: quickAddProxyId !== 'no-proxy' ? quickAddProxyId : undefined,
    });
  };

  // Manual Quick Add handler
  const handleManualQuickAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!quickAddEmail || !quickAddPassword || !manualHost || !manualPort) {
      toast.error('Please fill in all required fields');
      return;
    } 
    
    setIsAutoDetecting(true);
    setQuickAddStatus('🔗 Connecting to email server...');
    
    // Create manual account payload
    const accountPayload: AddAccountPayload = {
      email: quickAddEmail,
      provider: 'IMAP',
      auth: {
        host: manualHost,
        port: parseInt(manualPort, 10),
        secure: manualSecure,
        user: quickAddEmail,
        pass: quickAddPassword,
      },
      proxyId: quickAddProxyId !== 'no-proxy' ? quickAddProxyId : null,
    };
    
    // Add the account directly with manual settings
    let folderProgressInterval: NodeJS.Timeout | null = null;
    
    addEmailAccount(accountPayload)
      .then((result) => {
        // Clear interval on success
        if (folderProgressInterval) {
          clearInterval(folderProgressInterval);
          folderProgressInterval = null;
        }
        
        // Extract folder count from response if available
        const folderCount = result?.folderCount || 'unknown';
        setQuickAddStatus(`✅ Account added successfully! Total folders fetched: ${folderCount}`);
        toast.success(`Account added successfully! ${folderCount} folders fetched.`);
        queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
        
        // Reset form after short delay to show success status
        setTimeout(() => {
          setIsQuickAddDialogOpen(false);
          setQuickAddEmail("");
          setQuickAddPassword("");
          setQuickAddProxyId("no-proxy");
          setQuickAddStatus('');
          setUseManualSettings(false);
          setManualHost("");
          setManualPort("993");
          setManualSecure(true);
        }, 1500);
      })
      .catch((error: any) => {
        // Clear interval on error
        if (folderProgressInterval) {
          clearInterval(folderProgressInterval);
          folderProgressInterval = null;
        }
        
        // Extract meaningful error message
        let errorMessage = 'Unknown error occurred';
        
        if (error?.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error?.message) {
          const message = error.message;
          
          if (message.includes('AUTHENTICATIONFAILED')) {
            const match = message.match(/\[AUTHENTICATIONFAILED\]\s*(.+?)(?:\s*\(|$)/);
            errorMessage = match ? match[1].trim() : 'Invalid credentials';
          } else if (message.includes('Command failed')) {
            const match = message.match(/NO\s*\[?\w*\]?\s*(.+?)(?:\s*\(|$)/);
            errorMessage = match ? match[1].trim() : 'Connection failed';
          } else if (message.includes('ECONNREFUSED')) {
            errorMessage = 'Unable to connect to email server';
          } else if (message.includes('timeout')) {
            errorMessage = 'Connection timed out';
          } else if (message.includes('proxy')) {
            errorMessage = 'Proxy connection failed';
          } else {
            errorMessage = message;
          }
        }
        
        setQuickAddStatus(`❌ Failed to add account: ${errorMessage}`);
        toast.error(`Failed to add account: ${errorMessage}`);
        setIsAutoDetecting(false);
      });
    
    // Show folder fetching progress
    setQuickAddStatus('📁 Fetching email folders...');
    folderProgressInterval = setInterval(() => {
      const randomCount = Math.floor(Math.random() * 50) + 20;
      setQuickAddStatus(`📁 Fetching email folders... (${randomCount} found so far)`);
    }, 2000);
  };

  const handleOpenQuickAddDialog = (open: boolean) => {
    if (!open) {
      setQuickAddEmail("");
      setQuickAddPassword("");
      setQuickAddProxyId("no-proxy");
      setIsAutoDetecting(false);
      setQuickAddStatus('');
      setUseManualSettings(false);
      setManualHost("");
      setManualPort("993");
      setManualSecure(true);
    }
    setIsQuickAddDialogOpen(open);
  };

  const handleDeleteAccount = (accountId: string) => {
    deleteAccountMutation.mutate(accountId);
  };

  const handleDeleteAllAccounts = () => {
    deleteAllAccountsMutation.mutate();
  };



  // Job management functions
  const createJobMutation = useMutation({
    mutationFn: async ({ accountId, name, folders }: { accountId: string, name: string, folders?: string[] }) => {
      const account: any = accounts.find((acc: any) => (acc.id || acc._id) === accountId);
      if (!account) throw new Error("Account not found.");

      let foldersToSync: string[] = folders || [];

      // If no folders are explicitly provided, use all folders from the account
      if (foldersToSync.length === 0) {
        const imapProviders = ['gmail', 'outlook', 'yahoo', 'imap', 'exchange', 'comcast'];
        if (imapProviders.includes(account.provider?.toLowerCase())) {
          if (account.folders && account.folders.length > 0) {
            foldersToSync = account.folders.map((f: any) => f.path);
          } else {
            throw new Error("No folders found for this account. Please reconnect the account.");
          }
        }
      }

      // Include folder names in the job name for display purposes
      let displayName = name;
      if (foldersToSync.length > 0) {
        const folderNames = foldersToSync.map(path => path.split('/').pop() || path);
        displayName = `${name} (${folderNames.join(', ')})`;
      }

      // Check token balance before starting sync (warn if below 30)
      try {
        const tokenBalance = await getTokenBalance();
        if (tokenBalance.balance < 30) {
          const proceed = window.confirm(
            `Warning: Low token balance (${tokenBalance.balance} tokens remaining).\n\n` +
            `Email crawling requires tokens - you may not be able to view all results.\n` +
            `Consider topping up your tokens before starting this sync.\n\n` +
            `Do you want to continue anyway?`
          );

          if (!proceed) {
            throw new Error('Sync cancelled due to low token balance');
          }
        }
      } catch (tokenError) {
        // If token balance check fails, log but don't block the sync
        console.warn('Could not check token balance:', tokenError);
      }

      const syncResult = await startSync(accountId, foldersToSync, displayName);
      return { ...syncResult, jobName: displayName };
    },
    onSuccess: (data) => {
      toast.success(`Job "${data.jobName}" created and started successfully!`);
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
      setIsCreateJobDialogOpen(false);
      setJobName("");
      setSelectedJobAccountId(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create job: ${error.message}`);
    },
  });

  const fetchResultsMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // Fetch both job results and fresh job data
      const results = await getJobResults(jobId);

      // Also refresh the job list to get latest token information
      await queryClient.invalidateQueries({ queryKey: ['syncJobs'] });

      return results;
    },
    onSuccess: (data) => {
      setSelectedJobResults(data);
      setIsResultsModalOpen(true);
    },
    onError: (error: Error) => {
      toast.error(`Failed to fetch results: ${error.message}`);
    },
  });

  const deleteSyncJobMutation = useMutation({
    mutationFn: deleteSyncJob,
    onSuccess: () => {
      toast.success("Sync job deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete job: ${error.message}`);
    },
  });

  const stopSyncJobMutation = useMutation({
    mutationFn: stopSync,
    onSuccess: () => {
      toast.success("Crawl job cancelled successfully!");
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel job: ${error.message}`);
    },
  });

  const deleteAllSyncJobsMutation = useMutation({
    mutationFn: deleteAllSyncJobs,
    onSuccess: (data) => {
      const count = data.deletedCount || 0;
      if (count === 0) {
        toast.info("No crawl jobs to delete.");
      } else {
        toast.success(`Successfully deleted ${count} crawl job(s)!`);
      }
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete all jobs: ${error.message}`);
    },
  });

  // Handle job creation with optional folders parameter
  const handleCreateJob = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedJobAccountId && jobName) {
      createJobMutation.mutate({ 
        accountId: selectedJobAccountId,
        name: jobName,
        folders: selectedFolders
      });
    }
  };

  // Handle job creation from folder selection
  const handleCreateJobWithFolders = (folders: string[]) => {
    if (selectedJobAccountId && jobName) {
      createJobMutation.mutate({ 
        accountId: selectedJobAccountId,
        name: jobName,
        folders
      });
    }
  };

  const handleViewResults = (job: any) => {
    setSelectedJobName(job.name);
    setSelectedJob(job); // Store the initial job object

    const jobId = job.id || job._id;
    fetchResultsMutation.mutate(jobId, {
      onSuccess: () => {
        // After fetching results and refreshing job list, get the updated job with token info
        const updatedJobs = queryClient.getQueryData(['syncJobs']) as any[];
        if (updatedJobs) {
          const updatedJob = updatedJobs.find(j => (j.id || j._id) === jobId);
          if (updatedJob) {
            setSelectedJob(updatedJob); // Update with fresh job data containing token info
          }
        }
      }
    });
  };

  const handleDeleteJob = (job: any) => {
    if (job.status === 'running') {
      toast.error('Cannot delete a running job. Please stop the job first.');
      return;
    }
    
    setJobToDelete(job);
    setIsDeleteJobModalOpen(true);
  };
  
  const confirmDeleteJob = () => {
    if (jobToDelete) {
      deleteSyncJobMutation.mutate(jobToDelete.id || jobToDelete._id); // Support both Supabase (id) and MongoDB (_id) formats
      setIsDeleteJobModalOpen(false);
      setJobToDelete(null);
    }
  };

  const handleCancelJob = (job: any) => {
    if (job.status !== 'running') {
      toast.error('Can only cancel running jobs');
      return;
    }
    
    stopSyncJobMutation.mutate(job.id || job._id); // Support both Supabase (id) and MongoDB (_id) formats
  };

  const handleDeleteAllJobs = () => {
    const runningJobs = jobs.filter((job: any) => job.status === 'running');
    if (runningJobs.length > 0) {
      toast.error(`Cannot delete all jobs. ${runningJobs.length} job(s) are currently running. Please stop them first.`);
      return;
    }
    
    if (jobs.length === 0) {
      toast.info('No crawl jobs to delete.');
      return;
    }
    
    setIsDeleteAllJobsModalOpen(true);
  };
  
  const confirmDeleteAllJobs = () => {
    deleteAllSyncJobsMutation.mutate();
    setIsDeleteAllJobsModalOpen(false);
  };

  // Proxy testing functionality
  const testProxyMutation = useMutation({
    mutationFn: testProxyConnection,
    onSuccess: (data: ProxyTestResponse, proxyId: string) => {
      setTestingProxyId(null);
      if (data.success) {
        toast.success(`Proxy test successful! Response time: ${data.responseTime}ms`);
      } else {
        toast.error(`Proxy test failed: ${data.error || 'Unknown error'}`);
      }
    },
    onError: (error: Error, proxyId: string) => {
      setTestingProxyId(null);
      toast.error(`Proxy test failed: ${error.message}`);
    }
  });

  const handleTestProxy = (proxyId: string) => {
    setTestingProxyId(proxyId);
    testProxyMutation.mutate(proxyId);
  };

  // OAuth2 success handler
  const handleOAuthSuccess = async (tokenData: any) => {
    try {
      toast.success('OAuth2 authentication successful! Adding account...');
      
      // In a real implementation, you would get these tokens from the OAuth flow
      // For now, this is a placeholder that shows the structure
      const accountData = {
        email: tokenData.email,
        provider: 'outlook' as const,
        accessToken: tokenData.accessToken || 'mock_access_token',
        refreshToken: tokenData.refreshToken,
        expiresOn: tokenData.expiresOn || new Date(Date.now() + 3600000).toISOString(),
      };

      await addOAuthAccount(accountData);
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
      setIsOAuthDialogOpen(false);
      setOauthEmail("");
      toast.success('Microsoft account added successfully!');
      
    } catch (error: any) {
      toast.error(`Failed to add OAuth account: ${error.message}`);
    }
  };

  // Office365 cookie account mutation
  const addOffice365CookieAccountMutation = useMutation({
    mutationFn: addOffice365CookieAccount,
    onSuccess: () => {
      toast.success('Office365 account added successfully!');
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
    },
    onError: (error: any) => {
      toast.error(`Failed to add Office365 cookie account: ${error.message}`);
    }
  });

  // Handle Office365 cookie authentication
  const handleOffice365CookieAuth = async (email: string, cookies: any[], proxyId?: string): Promise<void> => {
    await addOffice365CookieAccountMutation.mutateAsync({
      email,
      cookies,
      proxyId,
    });
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected": return "bg-green-500 text-white";
      case "error": return "bg-red-500 text-white";
      case "syncing": return "bg-orange-500 text-white";
      case "crawling": return "bg-orange-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const getStatusDisplayText = (status: string) => {
    switch (status) {
      case "syncing": return "crawling";
      case "connected": return "connected";
      case "error": return "error";
      case "disconnected": return "disconnected";
      case "crawling": return "crawling";
      default: return status;
    }
  };

  const getProviderIcon = (provider: string) => {
    return <Mail className="h-5 w-5 text-primary" />;
  };

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'running':
        return <Badge variant="default"><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-orange-500 text-white"><StopCircle className="mr-1 h-3 w-3" />Cancelled</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="mr-1 h-3 w-3" />Unknown</Badge>;
    }
  };

  // Show loading overlay during initial data fetch
  if (isInitialLoading) {
    return (
      <div className="container mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Accounts & Jobs</h1>
            <p className="text-muted-foreground">Loading your data...</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <div className="space-y-2">
              <p className="text-lg font-medium">Loading your data</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isLoadingAccounts && <span>• Email accounts</span>}
                {isLoadingProxies && <span>• Proxies</span>}
                {isLoadingJobs && <span>• Crawl jobs</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Show error state if all requests failed
  if (hasErrors && !accounts.length && !proxies.length && !jobs.length) {
    return (
      <div className="container mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Accounts & Jobs</h1>
            <p className="text-muted-foreground">Unable to load data</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <XCircle className="h-8 w-8 mx-auto text-destructive" />
            <div className="space-y-2">
              <p className="text-lg font-medium">Failed to load data</p>
              <p className="text-sm text-muted-foreground">Please check your connection and try refreshing the page.</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Accounts & Jobs</h1>
          <p className="text-muted-foreground">Manage your email accounts and crawl jobs in one place</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mb-4">
        <Dialog open={isQuickAddDialogOpen} onOpenChange={handleOpenQuickAddDialog}>
          <DialogTrigger asChild>
            <Button
              className="bg-gradient-primary"
            >
              <Mail className="h-4 w-4 mr-2" />
              Quick Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Quick Add Email Account</DialogTitle>
              <DialogDescription>
                {useManualSettings 
                  ? "Enter your email credentials and IMAP server settings manually." 
                  : "Enter your email and password. We'll automatically detect the server settings for Gmail, Outlook, Yahoo, Comcast, and many other providers."
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={useManualSettings ? handleManualQuickAdd : handleQuickAdd} className="space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b">
                <Switch
                  id="manual-settings"
                  checked={useManualSettings}
                  onCheckedChange={setUseManualSettings}
                  disabled={isAutoDetecting}
                />
                <Label htmlFor="manual-settings">Manual IMAP Settings</Label>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quickEmail">Email Address</Label>
                <Input
                  id="quickEmail"
                  type="email"
                  placeholder="your.email@example.com"
                  value={quickAddEmail}
                  onChange={(e) => setQuickAddEmail(e.target.value)}
                  required
                  disabled={isAutoDetecting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quickPassword">Password</Label>
                <Input
                  id="quickPassword"
                  type="password"
                  placeholder="Your email password"
                  value={quickAddPassword}
                  onChange={(e) => setQuickAddPassword(e.target.value)}
                  required
                  disabled={isAutoDetecting}
                />
              </div>
              
              {useManualSettings && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="manualHost">IMAP Server</Label>
                    <Input
                      id="manualHost"
                      type="text"
                      placeholder="imap.gmail.com"
                      value={manualHost}
                      onChange={(e) => setManualHost(e.target.value)}
                      required
                      disabled={isAutoDetecting}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manualPort">Port</Label>
                      <Input
                        id="manualPort"
                        type="number"
                        placeholder="993"
                        value={manualPort}
                        onChange={(e) => setManualPort(e.target.value)}
                        required
                        disabled={isAutoDetecting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Security</Label>
                      <div className="flex items-center space-x-4 pt-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="ssl"
                            name="security"
                            checked={manualSecure}
                            onChange={() => setManualSecure(true)}
                            disabled={isAutoDetecting}
                          />
                          <Label htmlFor="ssl" className="text-sm">SSL/TLS</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="plain"
                            name="security"
                            checked={!manualSecure}
                            onChange={() => setManualSecure(false)}
                            disabled={isAutoDetecting}
                          />
                          <Label htmlFor="plain" className="text-sm">Plain</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="quickProxy">Proxy (Optional)</Label>
                <div className="flex gap-2">
                  <Select value={quickAddProxyId} onValueChange={setQuickAddProxyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a proxy (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-proxy">No Proxy</SelectItem>
                      {proxies.map((proxy: any) => (
                        <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                          {proxy.host}:{proxy.port} ({proxy.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {quickAddProxyId !== "no-proxy" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestProxy(quickAddProxyId)}
                      disabled={isAutoDetecting || testingProxyId === quickAddProxyId}
                      className="flex-shrink-0"
                    >
                      <RefreshCw className={`h-4 w-4 ${testingProxyId === quickAddProxyId ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
              </div>
              {quickAddStatus && (
                <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  {quickAddStatus}
                </div>
              )}
              <DialogFooter>
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-primary" 
                  disabled={isAutoDetecting || !quickAddEmail || !quickAddPassword || (useManualSettings && (!manualHost || !manualPort))}
                >
                  {isAutoDetecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Auto-detecting...
                    </>
                  ) : (
                    useManualSettings ? 'Add Account (Manual)' : 'Add Account'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          onClick={() => setIsBulkAddOpen(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Bulk Add
        </Button>

        <Button
          variant="outline"
          className="border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => setIsOAuthDialogOpen(true)}
        >
          <Shield className="h-4 w-4 mr-2" />
          Microsoft OAuth2
        </Button>

        <Office365CookieModal
          onAddAccount={handleOffice365CookieAuth}
          onTestProxy={handleTestProxy}
          proxies={proxies}
          testingProxyId={testingProxyId}
          isLoading={addOffice365CookieAccountMutation.isPending}
        />

        <Button
          variant="destructive"
          onClick={handleDeleteAllAccounts}
          disabled={accounts.length === 0 || deleteAllAccountsMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete All
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="accounts">Email Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="jobs">Crawl Jobs ({jobs.length})</TabsTrigger>
        </TabsList>

        {/* Email Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          <h2 className="text-2xl font-semibold mb-6">Email Accounts</h2>

          {/* Sync Results Display */}
          {currentSyncJobId && <ResultsDisplay syncJobId={currentSyncJobId} />}

          {/* Accounts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoadingAccounts && <p>Loading accounts...</p>}
            {!isLoadingAccounts && accounts.length === 0 && (
              <div className="col-span-full text-center py-8">
                <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No email accounts added yet.</p>
              </div>
            )}
            {accounts.map((account: any) => (
              <Card key={account.id || account._id} className="border-border hover:shadow-elegant transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getProviderIcon(account.provider)}
                      <CardTitle className="text-lg">{account.email}</CardTitle>
                    </div>
                    <Badge className={getStatusColor(account.status)}>
                      {account.status === "connected" && <Check className="h-3 w-3 mr-1" />}
                      {account.status === "error" && <X className="h-3 w-3 mr-1" />}
                      {getStatusDisplayText(account.status)}
                    </Badge>
                  </div>
                  <CardDescription className="break-all">
                    {account.provider} via {account.auth.host}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-medium">
                        {account.lastSync ? new Date(account.lastSync).toLocaleString() : 'Never'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedAccountId(account.id || account._id);
                      }}
                      disabled={account.provider.toLowerCase() === 'pop3' || !account.folders || account.folders.length === 0}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Select Folders
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAccount(account.id || account._id)}
                      disabled={deleteAccountMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Crawl Jobs Tab */}
        <TabsContent value="jobs" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Crawl Jobs</h2>
            <Dialog open={isCreateJobDialogOpen} onOpenChange={setIsCreateJobDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Job
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Crawl Job</DialogTitle>
                  <DialogDescription>
                    Select an email account and create a new crawl job to extract unique email addresses.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="jobName">Job Name</Label>
                    <Input
                      id="jobName"
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="Enter job name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account">Email Account</Label>
                    <Select value={selectedJobAccountId || ""} onValueChange={setSelectedJobAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter((account: any) => account.status === 'connected')
                          .map((account: any) => (
                            <SelectItem key={account.id || account._id} value={account.id || account._id}>
                              {account.email} ({account.provider})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateJob}
                    disabled={!selectedJobAccountId || !jobName || createJobMutation.isPending}
                    className="bg-gradient-primary"
                  >
                    {createJobMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Create & Start Job
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Jobs Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Jobs</CardTitle>
                  <CardDescription>Monitor your crawl jobs with live email counts and progress tracking</CardDescription>
                </div>
                {jobs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteAllJobs}
                    disabled={deleteAllSyncJobsMutation.isPending}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    {deleteAllSyncJobsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete All
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingJobs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8">
                  <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No crawl jobs created yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Folder</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Email Count</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job: any) => (
                      <TableRow key={job.id || job._id}>
                        <TableCell className="font-medium">
                          {accounts.find((acc: any) => (acc.id || acc._id) === job.account_id)?.email || (isLoadingAccounts ? 'Loading...' : 'Account not found')}
                        </TableCell>
                        <TableCell>
                          {job?.name && job.name.includes('(') ? (
                            <span className="text-muted-foreground">
                              {job.name.split('(')[1]?.replace(')', '') || 'Unknown folder'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">All folders</span>
                          )}
                        </TableCell>
                        <TableCell>{getJobStatusBadge(job.status)}</TableCell>
                        <TableCell>{job.created_at ? new Date(job.created_at).toLocaleString() : 'Invalid Date'}</TableCell>
                        <TableCell>
                          {job.status === 'completed' ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="font-medium text-green-700 dark:text-green-400">
                                {job.result_count || 0} emails
                              </span>
                            </div>
                          ) : job.status === 'running' ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              <span className="text-blue-700 dark:text-blue-400">
                                {(job.current_count || 0).toLocaleString()} emails
                              </span>
                            </div>
                          ) : job.status === 'failed' ? (
                            <div className="flex items-center gap-2">
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-red-700 dark:text-red-400">
                                Failed
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span className="text-muted-foreground">
                                Pending
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {job.status === 'running' ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">
                                  {job.processedFolders || 0}/{job.totalFolders || 0} folders
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                  style={{ 
                                    width: `${job.totalFolders ? (job.processedFolders / job.totalFolders) * 100 : 0}%` 
                                  }}
                                ></div>
                              </div>
                            </div>
                          ) : job.status === 'completed' ? (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span>Complete</span>
                            </div>
                          ) : job.status === 'failed' ? (
                            <div className="flex items-center gap-2 text-sm text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span>Failed</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              <span>Queued</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleViewResults(job)}
                                disabled={job.status !== 'completed' || fetchResultsMutation.isPending}
                              >
                                {fetchResultsMutation.isPending && fetchResultsMutation.variables === (job.id || job._id) ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                View Results
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Download className="mr-2 h-4 w-4" />
                                Download Results
                              </DropdownMenuItem>
                              {job.status === 'running' && (
                                <DropdownMenuItem
                                  className="text-orange-600"
                                  onClick={() => handleCancelJob(job)}
                                  disabled={stopSyncJobMutation.isPending}
                                >
                                  {stopSyncJobMutation.isPending && stopSyncJobMutation.variables === (job.id || job._id) ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <StopCircle className="mr-2 h-4 w-4" />
                                  )}
                                  Cancel Job
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600" 
                                onClick={() => handleDeleteJob(job)}
                                disabled={job.status === 'running' || deleteSyncJobMutation.isPending}
                              >
                                {deleteSyncJobMutation.isPending && deleteSyncJobMutation.variables === (job.id || job._id) ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                Delete Job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Modal */}
      <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
        <DialogContent className="max-w-4xl h-fit">
          <DialogHeader>
            <DialogTitle>Results for: {selectedJobName}</DialogTitle>
            <DialogDescription>
              Processed <strong>{selectedJob?.current_count || 0}</strong> messages and found <strong>{selectedJobResults?.results?.length || 0}</strong> unique email addresses (duplicates removed).
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto p-4">
            {selectedJobResults?.results?.length ? (
              <div className="space-y-4">
                {/* Token-based partial results notification */}
                {(() => {
                  // Parse token info from error field (temporary until schema update)
                  let tokenInfo = null;
                  try {
                    if (selectedJob?.error && selectedJob.error.startsWith('{')) {
                      tokenInfo = JSON.parse(selectedJob.error);
                    }
                  } catch (e) {
                    // Not JSON or parsing failed
                  }

                  const visibleCount = tokenInfo?.visible_email_count ?? selectedJob?.visible_email_count;
                  return visibleCount !== undefined && visibleCount < selectedJobResults.results.length;
                })() && (
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Coins className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        {(() => {
                          // Parse token info from error field (temporary until schema update)
                          let tokenInfo = null;
                          try {
                            if (selectedJob?.error && selectedJob.error.startsWith('{')) {
                              tokenInfo = JSON.parse(selectedJob.error);
                            }
                          } catch (e) {
                            // Not JSON or parsing failed
                          }

                          const visibleCount = tokenInfo?.visible_email_count ?? selectedJob?.visible_email_count ?? selectedJobResults.results.length;
                          const tokensNeeded = selectedJobResults.results.length - visibleCount;

                          return (
                            <>
                              <h4 className="font-medium text-blue-800 mb-2">Partial Results - {visibleCount}/{selectedJobResults.results.length} Emails Available</h4>
                              <p className="text-sm text-blue-700 mb-3">
                                You have {visibleCount} emails available with your current token balance.
                                {tokensNeeded} more emails are available with domain previews.
                                Top up {tokensNeeded} tokens to unlock all results.
                              </p>
                              <Button
                                onClick={() => {
                                  // Set the modal to token top-up mode
                                  setSelectedTokenAmount(tokensNeeded);
                                  setShowUpgradeModal(true);
                                }}
                                size="sm"
                                className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white"
                              >
                                <Coins className="h-4 w-4 mr-2" />
                                Top Up {tokensNeeded} Tokens
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}


                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Unique Email Addresses ({selectedJobResults.results.length}):</h4>
                  <div className="text-sm bg-background p-3 rounded border max-h-96 overflow-y-auto">
                    <div className="space-y-0">
                      {(() => {
                        let emailsToShow = selectedJobResults.results;

                        // Parse token info from error field (temporary until schema update)
                        let tokenInfo = null;
                        try {
                          if (selectedJob?.error && selectedJob.error.startsWith('{')) {
                            tokenInfo = JSON.parse(selectedJob.error);
                          }
                        } catch (e) {
                          // Not JSON or parsing failed
                        }

                        const visibleCount = tokenInfo?.visible_email_count ?? selectedJob?.visible_email_count;

                        // Apply token-based masking if available
                        if (visibleCount !== undefined) {
                          emailsToShow = maskEmailArrayPartialTokens(
                            selectedJobResults.results,
                            visibleCount,
                            true // Show domain preview
                          );
                        }
                        // No fallback masking - show all emails if no token restrictions

                        return emailsToShow.map((email: string, index: number) => (
                          <div key={index} className="font-mono text-sm leading-relaxed">
                            {email}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={async () => {
                      let emails = selectedJobResults.results;

                      // Parse token info from error field (temporary until schema update)
                      let tokenInfo = null;
                      try {
                        if (selectedJob?.error && selectedJob.error.startsWith('{')) {
                          tokenInfo = JSON.parse(selectedJob.error);
                        }
                      } catch (e) {
                        // Not JSON or parsing failed
                      }

                      const visibleCount = tokenInfo?.visible_email_count ?? selectedJob?.visible_email_count;

                      // Apply token-based masking if available
                      if (visibleCount !== undefined) {
                        emails = maskEmailArrayPartialTokens(
                          selectedJobResults.results,
                          visibleCount,
                          true // Show domain preview
                        );
                      }
                      // No fallback masking - show all emails if no token restrictions

                      const emailText = emails.join(',');
                      
                      try {
                        // Check if clipboard API is available
                        if (navigator.clipboard && window.isSecureContext) {
                          await navigator.clipboard.writeText(emailText);
                          toast.success(`Successfully copied ${selectedJobResults.results.length} email addresses to clipboard!`);
                        } else {
                          throw new Error('Clipboard API not available');
                        }
                      } catch (error) {
                        console.log('Clipboard API failed, using fallback:', error);
                        
                        // Fallback method - using legacy document.execCommand
                        try {
                          const textArea = document.createElement('textarea');
                          textArea.value = emailText;
                          
                          // Make sure the textarea is visible and selectable
                          textArea.style.position = 'absolute';
                          textArea.style.left = '0px';
                          textArea.style.top = '0px';
                          textArea.style.opacity = '0';
                          textArea.style.pointerEvents = 'none';
                          textArea.setAttribute('readonly', '');
                          
                          document.body.appendChild(textArea);
                          
                          // Select the text
                          textArea.select();
                          textArea.setSelectionRange(0, emailText.length);
                          
                          // Execute copy command
                          const successful = document.execCommand('copy');
                          
                          // Clean up
                          document.body.removeChild(textArea);
                          
                          console.log('Legacy copy method result:', successful);
                          
                          if (successful) {
                            toast.success(`Successfully copied ${emails.length} email addresses to clipboard!`);
                          } else {
                            // If execCommand fails, provide manual copy option
                            console.log('execCommand returned false, showing manual copy option');
                            toast.error('Automatic copy failed. The emails are displayed above - please select and copy them manually.');
                          }
                        } catch (fallbackError) {
                          console.error('Fallback clipboard method failed:', fallbackError);
                          toast.error('Copy to clipboard not supported. Please select and copy the emails manually from the list above.');
                        }
                      }
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Copy to Clipboard
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      try {
                        // Use newlines instead of commas for better readability
                        let emails = selectedJobResults.results;

                        // Parse token info from error field (temporary until schema update)
                        let tokenInfo = null;
                        try {
                          if (selectedJob?.error && selectedJob.error.startsWith('{')) {
                            tokenInfo = JSON.parse(selectedJob.error);
                          }
                        } catch (e) {
                          // Not JSON or parsing failed
                        }

                        const visibleCount = tokenInfo?.visible_email_count ?? selectedJob?.visible_email_count;

                        // Apply token-based masking if available
                        if (visibleCount !== undefined) {
                          emails = maskEmailArrayPartialTokens(
                            selectedJobResults.results,
                            visibleCount,
                            true // Show domain preview
                          );
                        }
                        // No fallback masking - show all emails if no token restrictions

                        const emailText = emails.join('\n');
                        const blob = new Blob([emailText], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        
                        // Generate safe filename
                        const safeName = selectedJobName 
                          ? selectedJobName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
                          : 'email_results';
                        a.download = `${safeName}_emails.txt`;
                        
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success(`Downloaded ${emails.length} email addresses!`);
                      } catch (error) {
                        console.error('Download failed:', error);
                        toast.error('Failed to download email addresses');
                      }
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download as TXT
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No email addresses found.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Folder Selection Modal */}
      {selectedAccountId && (
        <FolderSelectionModal
          accountId={selectedAccountId || ''}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedAccountId(null);
          }}
          onCrawlStarted={(syncJobId: string) => {
            setSelectedAccountId(null);
            queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
            toast.success('Crawl job started successfully!');
          }}
        />
      )}

      {/* Delete Job Confirmation Modal */}
      <Dialog open={isDeleteJobModalOpen} onOpenChange={setIsDeleteJobModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Delete Job
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the job <strong>"{jobToDelete?.name}"</strong>?
              <br />
              <span className="text-destructive font-medium">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteJobModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteJob}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Jobs Confirmation Modal */}
      <Dialog open={isDeleteAllJobsModalOpen} onOpenChange={setIsDeleteAllJobsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Delete All Jobs
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all <strong>{jobs.length} crawl job(s)</strong>?
              <br />
              <span className="text-destructive font-medium">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteAllJobsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAllJobs}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete All Jobs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Manager */}
      <BulkAddManager
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        proxies={proxies || []}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['emailAccounts'] });
        }}
      />

      {/* Microsoft OAuth2 Connect */}
      <MicrosoftOAuthConnect
        isOpen={isOAuthDialogOpen}
        onClose={() => setIsOAuthDialogOpen(false)}
        onSuccess={handleOAuthSuccess}
        email={oauthEmail}
      />

      {/* Upgrade Payment Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={(open) => {
        setShowUpgradeModal(open);
        if (!open) {
          setSelectedPaymentMethod('');
          setSelectedTokenAmount(0);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTokenAmount > 0 ? <Coins className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
              {selectedTokenAmount > 0 ? `Top Up ${selectedTokenAmount} Tokens` : 'Upgrade to Professional'}
            </DialogTitle>
            <DialogDescription>
              {selectedTokenAmount > 0
                ? `Purchase ${selectedTokenAmount} tokens to unlock ${selectedTokenAmount} more email addresses`
                : 'Unlock unmasked emails and advanced features with crypto payment'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Plan Features or Token Pricing */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-3">
                {selectedTokenAmount > 0 ? <Coins className="h-5 w-5 text-green-600" /> : <Zap className="h-5 w-5 text-blue-600" />}
                <h4 className="font-semibold text-blue-800">
                  {selectedTokenAmount > 0 ? 'Token Purchase' : 'Professional Plan'}
                </h4>
              </div>
              <div className="text-2xl font-bold text-blue-900 mb-2">
                {selectedTokenAmount > 0
                  ? `$${(selectedTokenAmount * 0.005).toFixed(2)}`
                  : '$29'}
                <span className="text-sm font-normal">
                  {selectedTokenAmount > 0 ? ' (one-time)' : '/month'}
                </span>
              </div>
              <ul className="text-sm text-blue-700 space-y-1">
                {selectedTokenAmount > 0 ? (
                  <>
                    <li>✓ {selectedTokenAmount} tokens for email unlocking</li>
                    <li>✓ Unlock {selectedTokenAmount} more email addresses</li>
                    <li>✓ Domain preview for all emails</li>
                    <li>✓ Instant access after payment</li>
                  </>
                ) : (
                  <>
                    <li>✓ See all email addresses unmasked</li>
                    <li>✓ Up to 10 email accounts</li>
                    <li>✓ Advanced export formats (CSV, JSON, XML)</li>
                    <li>✓ Priority support & API access</li>
                  </>
                )}
              </ul>
            </div>

            {/* Payment Methods */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Choose Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Bitcoin', symbol: 'BTC', icon: '₿' },
                  { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ' },
                  { name: 'USDT', symbol: 'USDT', icon: '₮' },
                  { name: 'USDC', symbol: 'USDC', icon: '$' },
                ].map((method) => (
                  <Button
                    key={method.symbol}
                    variant={selectedPaymentMethod === method.symbol ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPaymentMethod(method.symbol)}
                    className="justify-start h-12"
                  >
                    <span className="mr-2 text-lg">{method.icon}</span>
                    <div className="text-left">
                      <div className="text-xs font-medium">{method.name}</div>
                      <div className="text-xs text-muted-foreground">{method.symbol}</div>
                    </div>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Powered by NOWPayments - Secure cryptocurrency payments
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowUpgradeModal(false);
                  setSelectedPaymentMethod('');
                  setSelectedTokenAmount(0);
                }}
              >
                Maybe Later
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                onClick={() => {
                  if (!selectedPaymentMethod) {
                    toast.error('Please select a payment method');
                    return;
                  }
                  // TODO: Integrate with nowpayments.io
                  const type = selectedTokenAmount > 0 ? 'token purchase' : 'subscription upgrade';
                  toast.success(`Payment processing will be implemented with nowpayments.io for ${type}`);
                  setShowUpgradeModal(false);
                  setSelectedPaymentMethod('');
                  setSelectedTokenAmount(0);
                }}
                disabled={!selectedPaymentMethod}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {selectedTokenAmount > 0
                  ? `Pay $${(selectedTokenAmount * 0.005).toFixed(2)} Now`
                  : 'Pay $29 Now'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cookie Extractor */}
      {/* CookieExtractor component removed - will be re-added in future update */}
    </div>
  );
}
