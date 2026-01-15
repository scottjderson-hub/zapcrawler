import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Mail, 
  Shield,
  Download,
  Upload,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { addEmailAccount, autoDetectEmailSettings, AddAccountPayload } from '@/lib/api';
import { providerPresets } from '@/lib/provider-presets';

interface AccountValidation {
  email: string;
  password: string;
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'processing' | 'success' | 'error';
  error?: string;
  provider?: string;
  autoDetected?: boolean;
  mxRecord?: string;
}

interface EnhancedBulkAddProps {
  proxies: any[];
  onComplete?: () => void;
}

export function EnhancedBulkAdd({ proxies, onComplete }: EnhancedBulkAddProps) {
  const [bulkInput, setBulkInput] = useState('');
  const [selectedProxyId, setSelectedProxyId] = useState('no-proxy');
  const [accounts, setAccounts] = useState<AccountValidation[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessing, setCurrentProcessing] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    processed: 0,
    success: 0,
    failed: 0
  });

  const queryClient = useQueryClient();

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // DNS MX lookup function
  const lookupMXRecord = async (domain: string): Promise<string | null> => {
    try {
      const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
      const data = await response.json();
      
      if (data.Answer && data.Answer.length > 0) {
        // Get the MX record with lowest priority
        const mxRecord = data.Answer
          .filter((record: any) => record.type === 15) // MX records
          .sort((a: any, b: any) => {
            const aPriority = parseInt(a.data.split(' ')[0]);
            const bPriority = parseInt(b.data.split(' ')[0]);
            return aPriority - bPriority;
          })[0];
        
        if (mxRecord) {
          return mxRecord.data.split(' ')[1].replace(/\.$/, ''); // Remove trailing dot
        }
      }
      return null;
    } catch (error) {
      console.warn(`MX lookup failed for ${domain}:`, error);
      return null;
    }
  };

  // Parse input and validate accounts
  const parseAndValidateAccounts = async () => {
    if (!bulkInput.trim()) {
      toast.error('Please enter email:password combinations');
      return;
    }

    setIsValidating(true);
    const lines = bulkInput.trim().split('\n').filter(line => line.trim());
    const parsedAccounts: AccountValidation[] = [];

    // Parse input
    for (const line of lines) {
      const [email, password] = line.split(':').map(s => s.trim());
      
      if (!email || !password) {
        parsedAccounts.push({
          email: email || 'Invalid',
          password: password || '',
          status: 'invalid',
          error: 'Invalid format. Use email:password'
        });
        continue;
      }

      // Basic email validation
      if (!emailRegex.test(email)) {
        parsedAccounts.push({
          email,
          password,
          status: 'invalid',
          error: 'Invalid email format'
        });
        continue;
      }

      parsedAccounts.push({
        email,
        password,
        status: 'validating'
      });
    }

    setAccounts(parsedAccounts);

    // Validate emails with MX lookup and provider detection
    const validatedAccounts = await Promise.all(
      parsedAccounts.map(async (account) => {
        if (account.status === 'invalid') return account;

        try {
          const domain = account.email.split('@')[1];
          
          // MX record lookup
          const mxRecord = await lookupMXRecord(domain);
          
          // Provider detection
          let detectedProvider = 'Unknown';
          for (const preset of providerPresets) {
            if (preset.domains && preset.domains.some(d => domain.includes(d))) {
              detectedProvider = preset.name;
              break;
            }
          }

          if (mxRecord) {
            return {
              ...account,
              status: 'valid' as const,
              provider: detectedProvider,
              mxRecord
            };
          } else {
            return {
              ...account,
              status: 'invalid' as const,
              error: 'No MX record found'
            };
          }
        } catch (error) {
          return {
            ...account,
            status: 'invalid' as const,
            error: 'Validation failed'
          };
        }
      })
    );

    setAccounts(validatedAccounts);
    updateStats(validatedAccounts);
    setIsValidating(false);
  };

  // Update statistics
  const updateStats = (accountList: AccountValidation[]) => {
    const newStats = {
      total: accountList.length,
      valid: accountList.filter(a => a.status === 'valid').length,
      invalid: accountList.filter(a => a.status === 'invalid').length,
      processed: accountList.filter(a => ['success', 'error'].includes(a.status)).length,
      success: accountList.filter(a => a.status === 'success').length,
      failed: accountList.filter(a => a.status === 'error').length
    };
    setStats(newStats);
  };

  // Process valid accounts
  const processAccounts = async () => {
    const validAccounts = accounts.filter(a => a.status === 'valid');
    if (validAccounts.length === 0) {
      toast.error('No valid accounts to process');
      return;
    }

    setIsProcessing(true);
    setCurrentProcessing(0);

    const selectedProxy = selectedProxyId !== 'no-proxy' 
      ? proxies.find(p => (p.id || p._id) === selectedProxyId) // Support both Supabase (id) and MongoDB (_id) formats 
      : null;

    // Process accounts in parallel (batches of 3)
    const batchSize = 3;
    const batches = [];
    for (let i = 0; i < validAccounts.length; i += batchSize) {
      batches.push(validAccounts.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (account, index) => {
          try {
            // Update status to processing
            setAccounts(prev => prev.map(a => 
              a.email === account.email 
                ? { ...a, status: 'processing' }
                : a
            ));

            // Try auto-detection first
            let accountPayload: AddAccountPayload;
            
            try {
              const autoDetectResult = await autoDetectEmailSettings({
                email: account.email,
                password: account.password
              });

              if (autoDetectResult.success && autoDetectResult.data) {
                accountPayload = {
                  email: autoDetectResult.data.email,
                  provider: autoDetectResult.data.provider.type,
                  auth: {
                    host: autoDetectResult.data.provider.host,
                    port: autoDetectResult.data.provider.port,
                    secure: autoDetectResult.data.provider.secure,
                    username: autoDetectResult.data.auth.user,
                    password: account.password,
                  },
                  proxyId: selectedProxyId !== 'no-proxy' ? selectedProxyId : undefined
                };

                // Mark as auto-detected
                setAccounts(prev => prev.map(a => 
                  a.email === account.email 
                    ? { ...a, autoDetected: true }
                    : a
                ));
              } else {
                throw new Error('Auto-detection failed');
              }
            } catch (autoDetectError) {
              // Fallback to preset-based detection
              const domain = account.email.split('@')[1];
              let preset = null;
              
              for (const p of providerPresets) {
                if (p.domains && p.domains.some(d => domain.includes(d))) {
                  preset = p;
                  break;
                }
              }

              if (!preset) {
                throw new Error('No provider configuration found');
              }

              accountPayload = {
                email: account.email,
                provider: 'IMAP' as const,
                auth: {
                  host: preset.host,
                  port: preset.port,
                  secure: preset.security === 'ssl',
                  username: account.email,
                  password: account.password,
                },
                proxyId: selectedProxyId !== 'no-proxy' ? selectedProxyId : undefined
              };
            }

            // Add the account
            await addEmailAccount(accountPayload);

            // Update status to success
            setAccounts(prev => prev.map(a => 
              a.email === account.email 
                ? { ...a, status: 'success' }
                : a
            ));

          } catch (error: any) {
            // Update status to error
            setAccounts(prev => prev.map(a => 
              a.email === account.email 
                ? { ...a, status: 'error', error: error.message }
                : a
            ));
          }

          setCurrentProcessing(prev => prev + 1);
        })
      );
    }

    setIsProcessing(false);
    
    // Refresh accounts list
    queryClient.invalidateQueries({ queryKey: ['emailAccounts'] });
    
    // Show completion toast
    const finalStats = accounts.reduce((acc, account) => {
      if (account.status === 'success') acc.success++;
      if (account.status === 'error') acc.failed++;
      return acc;
    }, { success: 0, failed: 0 });

    toast.success(`Bulk add completed! ${finalStats.success} successful, ${finalStats.failed} failed`);
    
    if (onComplete) {
      onComplete();
    }
  };

  // Reset everything
  const resetAll = () => {
    setBulkInput('');
    setAccounts([]);
    setStats({ total: 0, valid: 0, invalid: 0, processed: 0, success: 0, failed: 0 });
    setCurrentProcessing(0);
  };

  // Update stats when accounts change
  useEffect(() => {
    updateStats(accounts);
  }, [accounts]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'validating':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'invalid':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (account: AccountValidation) => {
    switch (account.status) {
      case 'validating':
        return <Badge variant="secondary">Validating...</Badge>;
      case 'valid':
        return <Badge variant="default" className="bg-green-500">Valid</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-600">Added</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enhanced Bulk Add
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulkInput">Email Accounts (email:password format)</Label>
            <Textarea
              id="bulkInput"
              placeholder="user1@gmail.com:password123&#10;user2@outlook.com:mypassword&#10;user3@comcast.net:C0nTr!V3"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
              disabled={isValidating || isProcessing}
            />
            <div className="text-sm text-muted-foreground">
              Enter one account per line in email:password format. Auto-detection and MX validation will be performed.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proxySelect">Proxy (Optional)</Label>
            <Select 
              value={selectedProxyId} 
              onValueChange={setSelectedProxyId}
              disabled={isValidating || isProcessing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a proxy (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-proxy">No Proxy</SelectItem>
                {proxies.map((proxy: any) => (
                  <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                    {proxy.name} ({proxy.host}:{proxy.port})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={parseAndValidateAccounts}
              disabled={!bulkInput.trim() || isValidating || isProcessing}
              className="flex-1"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validate Accounts
                </>
              )}
            </Button>
            
            <Button 
              onClick={resetAll}
              variant="outline"
              disabled={isValidating || isProcessing}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
                <div className="text-sm text-muted-foreground">Valid</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.invalid}</div>
                <div className="text-sm text-muted-foreground">Invalid</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.success}</div>
                <div className="text-sm text-muted-foreground">Added</div>
              </div>
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing accounts...</span>
                  <span>{currentProcessing} / {stats.valid}</span>
                </div>
                <Progress value={(currentProcessing / stats.valid) * 100} />
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button 
                onClick={processAccounts}
                disabled={stats.valid === 0 || isProcessing || isValidating}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Add {stats.valid} Valid Accounts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account List */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {accounts.map((account, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(account.status)}
                    <div>
                      <div className="font-medium">{account.email}</div>
                      <div className="text-sm text-muted-foreground">
                        {account.provider && `Provider: ${account.provider}`}
                        {account.mxRecord && ` • MX: ${account.mxRecord}`}
                        {account.autoDetected && ` • Auto-detected`}
                      </div>
                      {account.error && (
                        <div className="text-sm text-red-600">{account.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(account)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
