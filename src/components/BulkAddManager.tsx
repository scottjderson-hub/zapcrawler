import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  addEmailAccount, 
  AddAccountPayload, 
  autoDetectEmailSettings,
  cancelBulkOperations,
  AutoDetectRequest
} from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileUp, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface BulkAddManagerProps {
  isOpen: boolean;
  onClose: () => void;
  proxies: any[];
  onComplete?: () => void;
}

interface ImportAccount {
  email: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  message: string;
  provider?: string;
  host?: string;
  port?: number;
}

interface ImportProgress {
  accounts: ImportAccount[];
  currentIndex: number;
  totalCount: number;
  isComplete: boolean;
}

interface ParsedAccount {
  email: string;
  password: string;
  provider?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
}

export function BulkAddManager({ isOpen, onClose, proxies, onComplete }: BulkAddManagerProps) {
  const queryClient = useQueryClient();
  
  // State management
  const [importData, setImportData] = useState('');
  const [bulkProxyId, setBulkProxyId] = useState('no-proxy');
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Mutations with abort signal support
  const autoDetectMutation = useMutation({
    mutationFn: ({ request, signal }: { request: AutoDetectRequest; signal?: AbortSignal }) => 
      autoDetectEmailSettings(request, signal),
  });

  const addAccountMutation = useMutation({
    mutationFn: ({ payload, signal }: { payload: AddAccountPayload; signal?: AbortSignal }) => 
      addEmailAccount(payload, signal),
  });

  // Parse import data from various formats
  const parseImportData = (data: string): ParsedAccount[] => {
    try {
      // Try parsing as JSON first
      const jsonData = JSON.parse(data);
      if (Array.isArray(jsonData)) {
        return jsonData;
      } else if (jsonData.accounts && Array.isArray(jsonData.accounts)) {
        return jsonData.accounts;
      } else {
        return [jsonData];
      }
    } catch {
      // Check for simple email:password or email,password format
      const lines = data.trim().split('\n').filter(line => line.trim());
      
      // Try parsing as simple email:password or email,password format
      const simpleFormatAccounts = [];
      let isSimpleFormat = true;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.includes(':')) {
          const [email, password] = trimmedLine.split(':').map(s => s.trim());
          if (email && password && email.includes('@')) {
            simpleFormatAccounts.push({ email, password });
          }
        } else if (trimmedLine.includes(',')) {
          const [email, password] = trimmedLine.split(',').map(s => s.trim());
          if (email && password && email.includes('@')) {
            simpleFormatAccounts.push({ email, password });
          }
        } else {
          isSimpleFormat = false;
          break;
        }
      }
      
      if (isSimpleFormat && simpleFormatAccounts.length > 0) {
        return simpleFormatAccounts;
      }
      
      // Try parsing as CSV with headers
      const accounts: ParsedAccount[] = [];
      const [headerLine, ...dataLines] = lines;
      
      if (!headerLine) return [];
      
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
      
      for (const line of dataLines) {
        const values = line.split(',').map(v => v.trim());
        const account: ParsedAccount = { email: '', password: '' };
        
        headers.forEach((header, index) => {
          if (values[index]) {
            switch (header) {
              case 'email':
                account.email = values[index];
                break;
              case 'password':
                account.password = values[index];
                break;
              case 'provider':
                account.provider = values[index];
                break;
              case 'host':
              case 'server':
                account.host = values[index];
                break;
              case 'port':
                account.port = parseInt(values[index]) || 993;
                break;
              case 'username':
                account.username = values[index];
                break;
              case 'secure':
              case 'ssl':
                account.secure = values[index].toLowerCase() === 'true';
                break;
            }
          }
        });
        
        if (account.email && account.password) {
          accounts.push(account);
        }
      }
      
      return accounts;
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setImportData(content);
      };
      reader.readAsText(file);
    }
  };

  // Main import handler
  const handleImportAccounts = async () => {
    if (!importData.trim()) {
      toast.error('Please provide import data or upload a file.');
      return;
    }

    try {
      const accountsToImport = parseImportData(importData);
      
      if (accountsToImport.length === 0) {
        toast.error('No valid accounts found in the import data.');
        return;
      }

      // Create abort controller and session ID for cancellation
      const controller = new AbortController();
      const newSessionId = `bulk-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setAbortController(controller);
      setSessionId(newSessionId);
      
      console.log(`🚀 Starting bulk import session: ${newSessionId}`);
      
      // Permanently close the original bulk add modal when import starts
      // This ensures it won't reappear later
      onClose();

      // Initialize progress modal
      const initialAccounts = accountsToImport.map(account => ({
        email: account.email,
        status: 'pending' as const,
        message: 'Waiting to process...'
      }));
      
      setImportProgress({
        accounts: initialAccounts,
        currentIndex: 0,
        totalCount: accountsToImport.length,
        isComplete: false
      });
      
      setIsImporting(true);
      let successCount = 0;
      let autoDetectedCount = 0;
      let manualCount = 0;

      // Process each account
      for (let i = 0; i < accountsToImport.length; i++) {
        // Check if operation was cancelled
        if (controller.signal.aborted) {
          toast.info('Bulk import was cancelled');
          return;
        }
        
        const accountData = accountsToImport[i];
        
        // Update current processing index
        setImportProgress(prev => prev ? {
          ...prev,
          currentIndex: i
        } : null);

        // Update status to processing
        setImportProgress(prev => prev ? {
          ...prev,
          accounts: prev.accounts.map((acc, idx) => 
            idx === i 
              ? { ...acc, status: 'processing', message: 'Processing account...' }
              : acc
          )
        } : null);

        try {
          // Try auto-detection first if no provider/host specified
          if (!accountData.provider && !accountData.host) {
            // Update status to auto-detecting
            setImportProgress(prev => prev ? {
              ...prev,
              accounts: prev.accounts.map((acc, idx) => 
                idx === i 
                  ? { ...acc, message: 'Auto-detecting settings...' }
                  : acc
              )
            } : null);

            const operationId = `${newSessionId}-detect-${i}-${accountData.email}`;
            const autoDetectResult = await autoDetectMutation.mutateAsync({
              request: {
                email: accountData.email,
                password: accountData.password,
                proxyId: bulkProxyId !== "no-proxy" ? bulkProxyId : undefined,
                operationId,
              },
              signal: controller.signal,
            });

            if (autoDetectResult.success && autoDetectResult.data) {
              // Instantly display detected IMAP settings
              const detectedServer = `${autoDetectResult.data.provider.host}:${autoDetectResult.data.provider.port}`;
              setImportProgress(prev => prev ? {
                ...prev,
                accounts: prev.accounts.map((acc, idx) => 
                  idx === i 
                    ? { 
                        ...acc, 
                        message: `✅ Found: ${autoDetectResult.data.provider.type.toUpperCase()} ${detectedServer}`,
                        provider: autoDetectResult.data.provider.type.toUpperCase(),
                        host: autoDetectResult.data.provider.host,
                        port: autoDetectResult.data.provider.port
                      }
                    : acc
                )
              } : null);
              
              // Brief pause to let user see the detected settings
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Update status to connecting
              setImportProgress(prev => prev ? {
                ...prev,
                accounts: prev.accounts.map((acc, idx) => 
                  idx === i 
                    ? { ...acc, message: `🔗 Connecting to ${detectedServer}...` }
                    : acc
                )
              } : null);
              
              // Auto-detection successful, add account with detected settings
              const payload: AddAccountPayload = {
                email: autoDetectResult.data.email,
                provider: autoDetectResult.data.provider.type,
                auth: {
                  host: autoDetectResult.data.provider.host,
                  port: autoDetectResult.data.provider.port,
                  secure: autoDetectResult.data.provider.secure,
                  user: autoDetectResult.data.auth.user,
                  pass: accountData.password,
                },
                proxyId: bulkProxyId !== "no-proxy" ? bulkProxyId : undefined,
              };

              await addAccountMutation.mutateAsync({
                payload,
                signal: controller.signal,
              });
              successCount++;
              autoDetectedCount++;
              
              // Update to success
              setImportProgress(prev => prev ? {
                ...prev,
                accounts: prev.accounts.map((acc, idx) => 
                  idx === i 
                    ? { 
                        ...acc, 
                        status: 'success', 
                        message: `Successfully added (${autoDetectResult.data.provider.type})`,
                        provider: autoDetectResult.data.provider.type
                      }
                    : acc
                )
              } : null);
            } else {
              throw new Error('Auto-detection failed');
            }
          } else {
            // Manual configuration provided
            setImportProgress(prev => prev ? {
              ...prev,
              accounts: prev.accounts.map((acc, idx) => 
                idx === i 
                  ? { ...acc, message: 'Adding account with manual settings...' }
                  : acc
              )
            } : null);

            const payload: AddAccountPayload = {
              email: accountData.email,
              provider: (accountData.provider as 'IMAP' | 'POP3' | 'Exchange') || 'IMAP',
              auth: {
                host: accountData.host || '',
                port: accountData.port || 993,
                secure: accountData.secure !== false,
                user: accountData.username || accountData.email,
                pass: accountData.password
              },
              proxyId: bulkProxyId !== "no-proxy" ? bulkProxyId : undefined,
            };

            await addAccountMutation.mutateAsync({
              payload,
              signal: controller.signal,
            });
            successCount++;
            manualCount++;
            
            // Update to success
            setImportProgress(prev => prev ? {
              ...prev,
              accounts: prev.accounts.map((acc, idx) => 
                idx === i 
                  ? { 
                      ...acc, 
                      status: 'success', 
                      message: `Successfully added (${accountData.provider || 'imap'})`,
                      provider: accountData.provider || 'imap'
                    }
                  : acc
              )
            } : null);
          }
        } catch (error: any) {
          console.error(`Failed to add account ${accountData.email}:`, error);
          
          // Update to failed
          setImportProgress(prev => prev ? {
            ...prev,
            accounts: prev.accounts.map((acc, idx) => 
              idx === i 
                ? { 
                    ...acc, 
                    status: 'failed', 
                    message: `Failed: ${error.message || 'Unknown error'}`
                  }
                : acc
            )
          } : null);
        }
      }

      // Mark as complete
      setImportProgress(prev => prev ? {
        ...prev,
        isComplete: true
      } : null);

      // Show completion message
      const failedCount = accountsToImport.length - successCount;
      let message = `Import completed! ${successCount} successful`;
      if (autoDetectedCount > 0) message += ` (${autoDetectedCount} auto-detected`;
      if (manualCount > 0) message += `, ${manualCount} manual`;
      if (autoDetectedCount > 0) message += ')';
      if (failedCount > 0) message += `, ${failedCount} failed`;

      toast.success(message);
      
      // Refresh accounts list
      queryClient.invalidateQueries({ queryKey: ['emailAccounts'] });
      
      // Keep progress modal open - user must close manually
      // No auto-close after completion
      
      if (onComplete) {
        onComplete();
      }

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
      // Keep progress modal open even on error - user must close manually
      // setImportProgress(null); // Don't clear progress on error
    } finally {
      setIsImporting(false);
      setAbortController(null);
    }
  };

  // Handle cancel with warning
  const handleCancelImport = () => {
    if (isImporting) {
      setShowCancelWarning(true);
    }
  };

  // Confirm cancellation
  const confirmCancelImport = async () => {
    try {
      // 1. Cancel frontend operations
      if (abortController) {
        abortController.abort();
        setAbortController(null);
      }
      
      // 2. Cancel backend operations if we have a session ID
      if (sessionId) {
        console.log(`🛑 Cancelling backend operations for session: ${sessionId}`);
        try {
          const result = await cancelBulkOperations(sessionId);
          console.log(`✅ Backend cancellation result:`, result);
          toast.info(`Cancelled ${result.cancelledCount} backend operations`);
        } catch (error) {
          console.error('Failed to cancel backend operations:', error);
          toast.warning('Frontend cancelled, but some backend operations may still be running');
        }
      }
      
      // 3. Clean up frontend state
      setIsImporting(false);
      setImportProgress(null);
      setShowCancelWarning(false);
      setSessionId(null);
      toast.success('Bulk import cancelled successfully');
    } catch (error) {
      console.error('Error during cancellation:', error);
      toast.error('Error during cancellation');
    }
  };

  // Generate sample data
  const generateSampleJSON = () => {
    const sampleJSON = {
      accounts: [
        {
          email: "user1@gmail.com",
          password: "your_app_password_here"
        },
        {
          email: "user2@outlook.com",
          password: "your_password_here"
        },
        {
          email: "user3@yahoo.com",
          password: "your_password_here"
        }
      ]
    };
    
    return JSON.stringify(sampleJSON, null, 2);
  };

  const generateSampleCSV = () => {
    return `email,password\nuser1@gmail.com,your_app_password_here\nuser2@outlook.com,your_password_here\nuser3@yahoo.com,your_password_here`;
  };

  const handleClose = () => {
    if (!isImporting) {
      setImportData('');
      setImportProgress(null);
      setBulkProxyId('no-proxy');
      onClose();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <>
      {/* Main Bulk Add Modal - Hidden during import */}
      <Dialog open={isOpen && !isImporting} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Add Email Accounts</DialogTitle>
            <DialogDescription>
              Import multiple email accounts from JSON, CSV, or simple email:password format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Proxy Selection */}
            <div className="space-y-2">
              <Label htmlFor="bulkProxy">Proxy (Optional)</Label>
              <Select value={bulkProxyId} onValueChange={setBulkProxyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a proxy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-proxy">No Proxy</SelectItem>
                  {proxies?.map((proxy: any) => (
                    <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                      {proxy.name} ({proxy.host}:{proxy.port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Import Data Input */}
            <div className="space-y-2">
              <Label htmlFor="importData">Import Data</Label>
              <Textarea
                id="importData"
                placeholder="Paste your account data here (JSON, CSV, or email:password format)..."
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Or Upload File</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                    <input
                      type="file"
                      accept=".json,.csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </Button>
                <span className="text-sm text-muted-foreground">
                  Supports .json, .csv, .txt files
                </span>
              </div>
            </div>



            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleImportAccounts} 
                disabled={!importData.trim() || isImporting}
                className="bg-gradient-primary"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4 mr-2" />
                    Start Import
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Large Progress Modal - Shown during import */}
      {importProgress && (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {importProgress.isComplete ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
                  )}
                  Bulk Import Progress
                </div>
                <div className="text-sm font-normal text-muted-foreground">
                  {importProgress.currentIndex + 1} / {importProgress.totalCount}
                </div>
              </DialogTitle>
              <DialogDescription>
                {importProgress.isComplete 
                  ? "Import completed. Review results below."
                  : "Processing accounts with auto-detection and proxy support..."
                }
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col space-y-4 overflow-hidden">
              {/* Overall Progress Bar */}
              <div className="space-y-2">
                <Progress 
                  value={((importProgress.currentIndex + (importProgress.isComplete ? 1 : 0)) / importProgress.totalCount) * 100} 
                  className="h-3"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round(((importProgress.currentIndex + (importProgress.isComplete ? 1 : 0)) / importProgress.totalCount) * 100)}% Complete</span>
                  <span>
                  success {importProgress.accounts.filter(a => a.status === 'success').length} • 
                  failed {importProgress.accounts.filter(a => a.status === 'failed').length} • 
                  pending {importProgress.accounts.filter(a => a.status === 'pending').length}
                  </span>
                </div>
              </div>

              {/* Compact Account List */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                <div className="grid grid-cols-1 gap-1 p-2 max-h-[50vh]">
                  {importProgress.accounts.map((account, index) => {
                    const isCurrentlyProcessing = index === importProgress.currentIndex && !importProgress.isComplete;
                    
                    return (
                      <div 
                        key={index} 
                        className={`flex items-center gap-2 p-2 rounded text-xs transition-all ${
                          isCurrentlyProcessing 
                            ? 'bg-blue-50 border border-blue-200' 
                            : account.status === 'success'
                            ? 'bg-green-50'
                            : account.status === 'failed'
                            ? 'bg-red-50'
                            : 'bg-gray-50'
                        }`}
                      >
                        {/* Tiny Status Icon */}
                        <div className="flex-shrink-0">
                          {account.status === 'success' ? (
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                          ) : account.status === 'failed' ? (
                            <div className="w-2 h-2 bg-red-500 rounded-full" />
                          ) : account.status === 'processing' || isCurrentlyProcessing ? (
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          ) : (
                            <div className="w-2 h-2 bg-gray-400 rounded-full" />
                          )}
                        </div>
                        
                        {/* Email */}
                        <div className="font-medium truncate min-w-0 flex-1">
                          {account.email}
                        </div>
                        
                        {/* Provider Badge */}
                        {account.provider && (
                          <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                            {account.provider}
                          </Badge>
                        )}
                        
                        {/* Server Info (when detected) */}
                        {account.host && account.port && (
                          <div className="text-xs font-mono text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                            {account.host}:{account.port}
                          </div>
                        )}
                        
                        {/* Status Message */}
                        <div className={`text-xs truncate max-w-48 ${
                          account.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'
                        }`}>
                          {account.message}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  {importProgress.isComplete ? (
                    <span className="text-green-600 font-medium">
                      ✅ Import completed! {importProgress.accounts.filter(a => a.status === 'success').length} successful, {importProgress.accounts.filter(a => a.status === 'failed').length} failed
                    </span>
                  ) : (
                    <span>Processing accounts...</span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {!importProgress.isComplete && (
                    <Button variant="outline" size="sm" onClick={handleCancelImport}>
                      Cancel Import
                    </Button>
                  )}
                  
                  {importProgress.isComplete && (
                    <Button onClick={() => setImportProgress(null)}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Warning Dialog */}
      <Dialog open={showCancelWarning} onOpenChange={setShowCancelWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Cancel Bulk Import?
            </DialogTitle>
            <DialogDescription>
              This will immediately stop all bulk add connections and cancel the import process. Any accounts that haven't been processed yet will be skipped.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowCancelWarning(false)}>
              Continue Import
            </Button>
            <Button variant="destructive" onClick={confirmCancelImport}>
              Yes, Cancel Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
