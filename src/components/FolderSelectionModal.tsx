import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { listFolders, startSync, getProxies } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface FolderSelectionModalProps {
  accountId: string;
  onOpenChange: (isOpen: boolean) => void;
  onCrawlStarted: (syncJobId: string) => void;
}

export function FolderSelectionModal({ accountId, onOpenChange, onCrawlStarted }: FolderSelectionModalProps) {
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');

  // Fetch available proxies
  const { data: proxies = [] } = useQuery({
    queryKey: ['proxies'],
    queryFn: getProxies,
  });

  const { data: folders = [], isLoading, isError } = useQuery({
    queryKey: ['folders', accountId],
    queryFn: () => listFolders(accountId),
    enabled: !!accountId,
  });

  const handleCheckboxChange = (folderPath: string) => {
    setSelectedFolders(prev => 
      prev.includes(folderPath) 
        ? prev.filter(p => p !== folderPath) 
        : [...prev, folderPath]
    );
  };

  const syncMutation = useMutation({
    mutationFn: (folders: string[]) => startSync(accountId, folders, `Folder crawl ${new Date().toLocaleString()}`, selectedProxyId || undefined),
    onSuccess: (data) => {
      if (data && data.syncJobId) {
        toast.success('Crawl job started successfully!');
        onCrawlStarted(data.syncJobId);
        onOpenChange(false);
      } else {
        toast.error('Crawl started but job ID not received');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to start crawl: ${error.message}`);
    },
  });

  const handleSave = () => {
    // Only validate proxy selection if proxies are available
    if (proxies.length > 0 && !selectedProxyId) {
      toast.error('Please select a proxy to prevent direct connections');
      return;
    }

    // If no folders selected, default to INBOX
    const foldersToSync = selectedFolders.length > 0 ? selectedFolders : ['INBOX'];
    syncMutation.mutate(foldersToSync);
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Folders to Crawl</DialogTitle>
          <DialogDescription>
            Choose the folders you want to include in the email crawl. If no folders are selected, only the INBOX will be crawled.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {/* Proxy Selection */}
          <div className="mb-4">
            <Label htmlFor="proxy-select" className="text-sm font-medium">
              Select Proxy {proxies.length > 0 ? '(Required)' : '(Optional - No proxies available)'}
            </Label>
            {proxies.length > 0 ? (
              <Select 
                value={selectedProxyId} 
                onValueChange={setSelectedProxyId}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a proxy to use for this crawl..." />
                </SelectTrigger>
                <SelectContent>
                  {proxies.map((proxy: any) => (
                    <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                      {proxy.name} ({proxy.host}:{proxy.port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full mt-1 p-2 border rounded-md bg-muted/50 text-muted-foreground text-sm">
                No proxies configured - Direct connection will be used
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {proxies.length > 0 
                ? 'A proxy is required to prevent direct connections to email servers'
                : 'You can add proxies in the Proxy Manager for anonymous connections'
              }
            </p>
          </div>

          {/* Folder Selection */}
          {isLoading && <p>Loading folders...</p>}
          {isError && <p className="text-destructive">Failed to load folders.</p>}
          {!isLoading && !isError && (
            <>
              <div className="flex gap-2 mb-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedFolders(folders.map(f => f.path))}
                  disabled={folders.length === 0}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedFolders([])}
                  disabled={selectedFolders.length === 0}
                >
                  Clear All
                </Button>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
              {folders.map(folder => (
                <div 
                  key={folder.path} 
                  className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleCheckboxChange(folder.path)}
                >
                  <Checkbox 
                    id={folder.path}
                    checked={selectedFolders.includes(folder.path)}
                    onCheckedChange={() => handleCheckboxChange(folder.path)}
                  />
                  <Label htmlFor={folder.path} className="font-normal cursor-pointer flex-1">
                    {folder.name} ({folder.messages} messages)
                  </Label>
                </div>
              ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            disabled={syncMutation.isPending || (proxies.length > 0 && !selectedProxyId)}
          >
            {syncMutation.isPending 
              ? 'Starting Crawl...' 
              : (proxies.length > 0 && !selectedProxyId) 
                ? 'Select Proxy to Continue' 
                : selectedFolders.length > 0 
                  ? 'Save and Start Crawl' 
                  : 'Start Crawl (INBOX only)'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
