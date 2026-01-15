import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Globe, RefreshCw, Trash2, Upload, Edit } from "lucide-react";
import { getProxies, addProxy as apiAddProxy, editProxy as apiEditProxy, deleteProxy as apiDeleteProxy, testProxyConnection, ProxyTestResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface Proxy {
  _id?: string; // MongoDB format
  id?: string;  // Supabase format
  name: string;
  host: string;
  port: number;
  type: 'SOCKS5' | 'HTTP';
  userId?: string;
  password?: string;
  // Frontend-specific properties, will be mocked for now
  status?: 'active' | 'error' | 'testing';
  responseTime?: number;
  usage?: number;
}

type ProxyInput = Omit<Proxy, '_id' | 'status' | 'responseTime' | 'usage'>;

// API Functions
const fetchProxies = async (): Promise<Proxy[]> => {
  console.log('fetchProxies called - using getProxies from lib/api.ts');
  const data = await getProxies();
  console.log('getProxies returned:', data);
  // Mock frontend-specific properties for now
  return data.map((p: any) => ({
    ...p,
    status: 'active',
    responseTime: Math.floor(Math.random() * 300) + 50,
    usage: Math.floor(Math.random() * 100),
  }));
};

const addProxy = async (newProxy: ProxyInput): Promise<Proxy> => {
  console.log('addProxy called with:', newProxy);
  const result = await apiAddProxy(newProxy);
  console.log('apiAddProxy returned:', result);
  return result;
};

const editProxy = async (proxyId: string, updatedProxy: ProxyInput): Promise<Proxy> => {
  console.log('editProxy called with:', proxyId, updatedProxy);
  const result = await apiEditProxy(proxyId, updatedProxy);
  console.log('apiEditProxy returned:', result);
  return result;
};

const deleteProxy = async (id: string): Promise<void> => {
  console.log('deleteProxy called with id:', id);
  await apiDeleteProxy(id);
  console.log('apiDeleteProxy completed successfully');
};

export default function ProxyManager() {
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [proxyToDelete, setProxyToDelete] = useState<Proxy | null>(null);
  const [proxyToEdit, setProxyToEdit] = useState<Proxy | null>(null);
  const [newProxy, setNewProxy] = useState<ProxyInput>({ name: '', host: '', port: 0, type: 'SOCKS5', userId: '', password: '' });
  const [editProxyData, setEditProxyData] = useState<ProxyInput>({ name: '', host: '', port: 0, type: 'SOCKS5', userId: '', password: '' });
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: proxies = [], isLoading, isError } = useQuery<Proxy[]>({
    queryKey: ['proxies'],
    queryFn: fetchProxies
  });

  const addProxyMutation = useMutation({
    mutationFn: addProxy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      setAddDialogOpen(false);
      setNewProxy({ name: '', host: '', port: 0, type: 'SOCKS5', userId: '', password: '' });
      toast.success("Proxy added successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to add proxy: ${error.message}`);
    }
  });

  const editProxyMutation = useMutation({
    mutationFn: ({ proxyId, updatedProxy }: { proxyId: string; updatedProxy: ProxyInput }) => 
      editProxy(proxyId, updatedProxy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      setEditDialogOpen(false);
      setProxyToEdit(null);
      setEditProxyData({ name: '', host: '', port: 0, type: 'SOCKS5', userId: '', password: '' });
      toast.success("Proxy updated successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to update proxy: ${error.message}`);
    }
  });

  const deleteProxyMutation = useMutation({
    mutationFn: deleteProxy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      setProxyToDelete(null);
      toast.success("Proxy deleted successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to delete proxy: ${error.message}`);
    }
  });

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

  const handleAddProxy = () => {
    if (!newProxy.name || !newProxy.host || !newProxy.port) {
        toast.error("Please fill in all required fields: Name, Host, and Port.");
        return;
    }
    addProxyMutation.mutate(newProxy);
  };

  const handleEditProxy = (proxy: Proxy) => {
    setProxyToEdit(proxy);
    setEditProxyData({
      name: proxy.name,
      host: proxy.host,
      port: proxy.port,
      type: proxy.type,
      userId: proxy.userId || '',
      password: proxy.password || ''
    });
    setEditDialogOpen(true);
  };

  const handleUpdateProxy = () => {
    if (!editProxyData.name || !editProxyData.host || !editProxyData.port) {
        toast.error("Please fill in all required fields: Name, Host, and Port.");
        return;
    }
    if (proxyToEdit) {
      editProxyMutation.mutate({
        proxyId: proxyToEdit.id || proxyToEdit._id!,
        updatedProxy: editProxyData
      });
    }
  };

  const handleDeleteProxy = () => {
    if (proxyToDelete) {
      deleteProxyMutation.mutate(proxyToDelete.id || proxyToDelete._id);
    }
  };

  const handleTestProxy = (proxy: Proxy) => {
    const proxyId = proxy.id || proxy._id;
    setTestingProxyId(proxyId);
    testProxyMutation.mutate(proxyId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-success text-success-foreground";
      case "error": return "bg-destructive text-destructive-foreground";
      case "testing": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getResponseTimeColor = (time: number) => {
    if (time === 0) return "text-muted-foreground";
    if (time < 200) return "text-success";
    if (time < 500) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proxy Manager</h1>
          <p className="text-muted-foreground">Manage and monitor your proxy servers</p>
        </div>
        
        <div className="flex gap-2">
          {/* Import Dialog (placeholder) */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import Proxies
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-popover">
              <DialogHeader>
                <DialogTitle>Import Proxies</DialogTitle>
                <DialogDescription>
                  This feature is coming soon.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>

          {/* Add Proxy Dialog */}
          <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Proxy
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-popover">
              <DialogHeader>
                <DialogTitle>Add Proxy Server</DialogTitle>
                <DialogDescription>
                  Configure a new proxy server.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="My Awesome Proxy" value={newProxy.name} onChange={(e) => setNewProxy({...newProxy, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="host">Host/IP</Label>
                    <Input id="host" placeholder="127.0.0.1" value={newProxy.host} onChange={(e) => setNewProxy({...newProxy, host: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input id="port" placeholder="8080" type="number" value={newProxy.port || ''} onChange={(e) => setNewProxy({...newProxy, port: parseInt(e.target.value, 10) || 0})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={newProxy.type} onValueChange={(value: 'SOCKS5' | 'HTTP') => setNewProxy({...newProxy, type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="SOCKS5">SOCKS5</SelectItem>
                      <SelectItem value="HTTP">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" placeholder="(Optional)" value={newProxy.userId} onChange={(e) => setNewProxy({...newProxy, userId: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="(Optional)" value={newProxy.password} onChange={(e) => setNewProxy({...newProxy, password: e.target.value})} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddProxy} disabled={addProxyMutation.isPending}>
                  {addProxyMutation.isPending ? 'Adding...' : 'Add Proxy'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Stats (placeholders) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground">{proxies.length}</p>
                <p className="text-sm text-muted-foreground">Total Proxies</p>
              </div>
              <Globe className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        {/* Other stat cards can be dynamically calculated if needed */}
      </div>

      {/* Proxies Grid */}
      {isLoading && <p>Loading proxies...</p>}
      {isError && <p className="text-destructive">Error fetching proxies.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {proxies.map((proxy) => (
          <Card key={proxy.id || proxy._id} className="border-border hover:shadow-elegant transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">{proxy.name}</CardTitle>
                </div>
                <Badge className={getStatusColor(proxy.status)}>
                  {proxy.status}
                </Badge>
              </div>
              <CardDescription>
                {proxy.host}:{proxy.port}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{proxy.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Response Time</span>
                  <span className={`font-medium ${getResponseTimeColor(proxy.responseTime)}`}>
                    {proxy.responseTime === 0 ? "N/A" : `${proxy.responseTime}ms`}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Usage</span>
                  <span className="font-medium">{proxy.usage}%</span>
                </div>
                <Progress value={proxy.usage} className="h-2" />
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleTestProxy(proxy)}
                  disabled={testingProxyId === (proxy.id || proxy._id)}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${testingProxyId === (proxy.id || proxy._id) ? 'animate-spin' : ''}`} />
                  {testingProxyId === (proxy.id || proxy._id) ? 'Testing...' : 'Test'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleEditProxy(proxy)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setProxyToDelete(proxy)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Proxy Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-popover">
          <DialogHeader>
            <DialogTitle>Edit Proxy</DialogTitle>
            <DialogDescription>
              Update the proxy settings for <strong>{proxyToEdit?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">Name</Label>
              <Input
                id="edit-name"
                value={editProxyData.name}
                onChange={(e) => setEditProxyData({ ...editProxyData, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-host" className="text-right">Host</Label>
              <Input
                id="edit-host"
                value={editProxyData.host}
                onChange={(e) => setEditProxyData({ ...editProxyData, host: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-port" className="text-right">Port</Label>
              <Input
                id="edit-port"
                type="number"
                value={editProxyData.port}
                onChange={(e) => setEditProxyData({ ...editProxyData, port: parseInt(e.target.value) || 0 })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-type" className="text-right">Type</Label>
              <Select value={editProxyData.type} onValueChange={(value: 'SOCKS5' | 'HTTP') => setEditProxyData({ ...editProxyData, type: value })}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOCKS5">SOCKS5</SelectItem>
                  <SelectItem value="HTTP">HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-userId" className="text-right">Username</Label>
              <Input
                id="edit-userId"
                value={editProxyData.userId}
                onChange={(e) => setEditProxyData({ ...editProxyData, userId: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-password" className="text-right">Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={editProxyData.password}
                onChange={(e) => setEditProxyData({ ...editProxyData, password: e.target.value })}
                className="col-span-3"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProxy} disabled={editProxyMutation.isPending}>
              {editProxyMutation.isPending ? 'Updating...' : 'Update Proxy'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!proxyToDelete} onOpenChange={(isOpen) => !isOpen && setProxyToDelete(null)}>
        <DialogContent className="sm:max-w-[425px] bg-popover">
          <DialogHeader>
            <DialogTitle>Delete Proxy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the proxy <strong>{proxyToDelete?.name}</strong> ({proxyToDelete?.host})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProxyToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProxy} disabled={deleteProxyMutation.isPending}>
              {deleteProxyMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}