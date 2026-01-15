import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmailAccounts, addEmailAccount, AddAccountPayload, deleteEmailAccount, deleteAllEmailAccounts, getProxies } from "@/lib/api";
import { providerPresets } from "@/lib/provider-presets";
import ResultsDisplay from '@/components/ResultsDisplay';
import { toast } from "sonner";
import { Plus, Mail, Check, X, Settings, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FolderSelectionModal } from "../components/FolderSelectionModal";
import { Textarea } from "@/components/ui/textarea";

const initialFormState = {
  provider: "",
  email: "",
  password: "",
  server: "",
  port: "",
  security: "ssl",
  proxyId: "",
};

export default function EmailAccounts() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentSyncJobId, setCurrentSyncJobId] = useState<string | null>(null);
  const [formState, setFormState] = useState(initialFormState);
  const [protocol, setProtocol] = useState<'IMAP' | 'POP3'>('POP3');

  // Effect to update form when protocol changes
  useEffect(() => {
    // When the protocol changes, re-evaluate the selected provider
    if (formState.provider) {
      handleProviderChange(formState.provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol]);
  const [bulkAccounts, setBulkAccounts] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { data: proxies = [] } = useQuery({ queryKey: ['proxies'], queryFn: getProxies });

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setFormState(initialFormState); // Reset form state when dialog opens
      setProtocol('POP3');
    }
    setIsDialogOpen(open);
  };

  const {
    data: accounts = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ["emailAccounts"], queryFn: getEmailAccounts });

  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3001');

    ws.onopen = () => {
      console.log('WebSocket connection established');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'ACCOUNT_STATUS_UPDATED') {
        const updatedAccount = message.payload;
        queryClient.setQueryData(['emailAccounts'], (oldData: any) => {
          if (!oldData) return [];
          return oldData.map((account: any) => 
            (account.id || account._id) === (updatedAccount.id || updatedAccount._id) ? updatedAccount : account
          );
        });
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Clean up the connection when the component unmounts
    return () => {
      ws.close();
    };
  }, [queryClient]);

  const addAccountMutation = useMutation({
    mutationFn: (payload: AddAccountPayload) => addEmailAccount(payload),
        onSuccess: () => {
      toast.success("Account added successfully!");
      queryClient.invalidateQueries({ queryKey: ["emailAccounts"] });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to add account: ${error.message}`);
    },
  });

  const handleProviderChange = (providerName: string) => {
    // Find the preset that matches both the provider name and the selected protocol
    const preset = providerPresets.find(p => p.name === providerName);
    if (preset) {
      setFormState(prevState => ({
        ...prevState,
        provider: preset.name,
        server: preset.host,
        port: String(preset.port),
        security: preset.security,
      }));
    } else {
      // If no preset is found (e.g., for 'Custom'), just update the provider name
      setFormState(prevState => ({
        ...prevState,
        provider: providerName,
      }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSecurityChange = (value: string) => {
    setFormState(prevState => ({
      ...prevState,
      security: value,
    }));
  };

  const handleProxyChange = (proxyId: string) => {
    setFormState(prevState => ({ ...prevState, proxyId }));
  };

  const handleAddAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const selectedProxy = proxies.find(p => p._id === formState.proxyId);

    const payload: AddAccountPayload = {
      provider: (formState.provider || protocol) as 'IMAP' | 'POP3' | 'Exchange',
      email: formState.email,
      auth: {
        user: formState.email,
        pass: formState.password,
        host: formState.server,
        port: Number(formState.port),
        secure: formState.security === "ssl",
      },
      proxyId: selectedProxy ? selectedProxy._id : undefined,
    };
    addAccountMutation.mutate(payload);
  };

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

  const handleDeleteAccount = (accountId: string) => {
    if (window.confirm("Are you sure you want to delete this account?")) {
      deleteAccountMutation.mutate(accountId);
    }
  };

  const handleDeleteAllAccounts = () => {
    if (window.confirm("Are you sure you want to delete ALL accounts? This action cannot be undone.")) {
      deleteAllAccountsMutation.mutate();
    }
  };

  const handleBulkAdd = () => {
    const accounts = bulkAccounts.split('\n').filter(line => line.trim() !== '');
    accounts.forEach(account => {
      const [email, password] = account.split(':');
      if (!email || !password) {
        toast.error(`Invalid format for line: ${account}`);
        return;
      }

      const domain = email.split('@')[1];
      const preset = providerPresets.find(p => p.domains.includes(domain));

      const payload: AddAccountPayload = {
        provider: preset?.type || 'IMAP',
        email: email.trim(),
        auth: {
          host: preset?.host || '',
          port: preset?.port || 993,
          secure: preset?.security === 'ssl',
          user: email.trim(),
          pass: password.trim(),
        }
      };

      if (!preset) {
        toast.warning(`Provider for ${domain} not found. Please configure manually.`);
        // Maybe open the single add form with the email pre-filled?
        // For now, we just skip.
        return;
      }

      addAccountMutation.mutate(payload);
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected": return "bg-success text-success-foreground";
      case "error": return "bg-destructive text-destructive-foreground";
      case "syncing": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getProviderIcon = (provider: string) => {
    return <Mail className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Accounts</h1>
          <p className="text-muted-foreground">Manage your email accounts for harvesting</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary hover:opacity-90 shadow-glow">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] bg-popover">
            <DialogHeader>
              <DialogTitle>Add Email Account</DialogTitle>
              <DialogDescription>
                Connect a new email account for harvesting operations
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="oauth">OAuth2</TabsTrigger>
                <TabsTrigger value="password">App Password</TabsTrigger>
              </TabsList>
              
              <TabsContent value="oauth" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="oauth-provider">Provider</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="Google">Google</SelectItem>
                        <SelectItem value="Microsoft">Microsoft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oauth-email">Email Address</Label>
                    <Input id="oauth-email" name="email" placeholder="user@example.com" />
                  </div>
                </div>
                <Button className="w-full bg-gradient-primary">
                  Connect with OAuth2
                </Button>
              </TabsContent>
              
              <TabsContent value="password" className="space-y-4">
                <Tabs defaultValue="single" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="single">Single Account</TabsTrigger>
                    <TabsTrigger value="bulk">Bulk Add</TabsTrigger>
                  </TabsList>
                  <TabsContent value="single" className="pt-4">
                    <form onSubmit={handleAddAccount} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Protocol</Label>
                        <RadioGroup value={protocol} onValueChange={(value) => setProtocol(value as 'IMAP' | 'POP3')} className="flex space-x-4">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="POP3" id="pop3" />
                            <Label htmlFor="pop3">POP3</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="IMAP" id="imap" />
                            <Label htmlFor="imap">IMAP</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Select onValueChange={handleProviderChange} value={formState.provider}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            {providerPresets
                              .filter((p) => p.type === protocol)
                              .map((preset) => (
                              <SelectItem key={`${preset.name}-${preset.type}`} value={preset.name}>
                                {preset.name} ({preset.type})
                              </SelectItem>
                            ))}
                            <SelectItem value="other">Other (Manual Configuration)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input id="email" name="email" placeholder="you@example.com" value={formState.email} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" value={formState.password} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="server">Server</Label>
                        <Input id="server" name="server" placeholder="imap.example.com" value={formState.server} onChange={handleInputChange} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="port">Port</Label>
                          <Input id="port" name="port" placeholder="993" value={formState.port} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="security">Security</Label>
                          <Select
                            value={formState.security}
                            onValueChange={handleSecurityChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select security type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ssl">SSL/TLS</SelectItem>
                              <SelectItem value="starttls">STARTTLS</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proxy">Proxy (Optional)</Label>
                        <Select
                          value={formState.proxyId}
                          onValueChange={handleProxyChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="No Proxy" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Proxy</SelectItem>
                            {proxies.map((proxy: any) => (
                              <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                                {proxy.name} ({proxy.host}:{proxy.port})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full bg-gradient-primary" disabled={addAccountMutation.isPending}>
                        {addAccountMutation.isPending ? 'Testing...' : 'Test & Save Connection'}
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="bulk" className="pt-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bulk-accounts">Accounts (email:password)</Label>
                        <Textarea
                          id="bulk-accounts"
                          placeholder="user1@example.com:password123\nuser2@example.com:password456"
                          className="h-40"
                          value={bulkAccounts}
                          onChange={(e) => setBulkAccounts(e.target.value)}
                        />
                      </div>
                      <Button className="w-full bg-gradient-primary" onClick={handleBulkAdd} disabled={addAccountMutation.isPending || bulkAccounts.trim() === ''}>
                        {addAccountMutation.isPending ? 'Adding...' : 'Add Accounts'}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        <Button
          variant="destructive"
          onClick={handleDeleteAllAccounts}
          disabled={accounts.length === 0 || deleteAllAccountsMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete All
        </Button>
      </div>

      {/* Accounts Grid */}
      {currentSyncJobId && <ResultsDisplay syncJobId={currentSyncJobId} />}

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading && <p>Loading accounts...</p>}
      {isError && <p className="text-destructive">Failed to load accounts.</p>}
      {!isLoading && !isError && accounts.map((account) => (
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
                  {account.status}
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
                  onClick={() => setSelectedAccountId(account.id || account._id)}
                  disabled={account.status !== 'connected' || account.provider.toLowerCase() === 'pop3'}
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

      {currentSyncJobId && <ResultsDisplay syncJobId={currentSyncJobId} />}

      {selectedAccountId && (
        <FolderSelectionModal
          accountId={selectedAccountId}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSelectedAccountId(null);
            }
          }}
          onSyncStarted={(syncJobId) => setCurrentSyncJobId(syncJobId)}
        />
      )}
    </div>
  );
}