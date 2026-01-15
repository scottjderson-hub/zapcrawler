import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSyncJobResults } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, Mail, Folder, CheckCircle, XCircle } from 'lucide-react';
import { useWebSocketContext, SyncProgressEvent } from '@/contexts/SupabaseRealtimeContext';

interface ResultsDisplayProps {
  syncJobId: string;
}

interface SyncProgress {
  currentFolder?: string;
  processed: number;
  total: number;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  messageCount: number;
  error?: string;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ syncJobId }) => {
  const [progress, setProgress] = useState<SyncProgress>({
    processed: 0,
    total: 0,
    status: 'idle',
    messageCount: 0
  });
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'started' | 'completed' | 'failed'>('idle');
  const [email, setEmail] = useState<string>('');
  
  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useWebSocketContext();
  
  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage || !lastMessage.payload || lastMessage.payload.syncJobId !== syncJobId) return;
    
    const { type, payload } = lastMessage;
    
    switch (type) {
      case 'SYNC_STARTED':
        setSyncStatus('started');
        setEmail(payload?.email || '');
        setProgress(prev => ({ ...prev, status: 'syncing' }));
        break;
        
      case 'SYNC_PROGRESS':
        setProgress(prev => ({
          ...prev,
          currentFolder: payload?.currentFolder || prev.currentFolder,
          processed: payload?.processed || prev.processed,
          total: payload?.total || prev.total,
          status: 'syncing',
          messageCount: payload?.messageCount || prev.messageCount
        }));
        break;
        
      case 'SYNC_MESSAGE_COUNT':
        setProgress(prev => ({
          ...prev,
          messageCount: payload?.messageCount || prev.messageCount
        }));
        break;
        
      case 'SYNC_COMPLETED':
        setSyncStatus('completed');
        setProgress(prev => ({ ...prev, status: 'completed' }));
        break;
        
      case 'SYNC_FAILED':
        setSyncStatus('failed');
        setProgress(prev => ({ 
          ...prev, 
          status: 'error',
          error: payload?.error || 'Sync failed' 
        }));
        break;
    }
  }, [lastMessage, syncJobId]);

  const { data, error, isLoading } = useQuery({
    queryKey: ['syncResults', syncJobId],
    queryFn: () => getSyncJobResults(syncJobId),
    refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'completed' || status === 'failed' ? false : 15000; // Increased from 2s to 15s
    },
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
    refetchOnWindowFocus: false, // Prevent excessive requests on window focus
    enabled: !!syncJobId,
  });

  const renderContent = () => {
    // Show real-time progress if sync is active
    if (syncStatus === 'started' || progress.status === 'syncing') {
      const progressPercentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;
      
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="font-medium">Syncing {email}...</span>
            {!isConnected && (
              <span className="text-sm text-yellow-600">(Reconnecting...)</span>
            )}
          </div>
          
          {progress.currentFolder && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Folder className="h-4 w-4" />
              <span>Current folder: {progress.currentFolder}</span>
            </div>
          )}
          
          {progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress: {progress.processed} / {progress.total} messages</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
          
          {progress.messageCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Mail className="h-4 w-4" />
              <span>Found {progress.messageCount} emails so far</span>
            </div>
          )}
        </div>
      );
    }
    
    if (isLoading && !data) {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Initializing...</span>
        </div>
      );
    }

    if (error) {
      return <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>;
    }

    if (!data) return null;

    const { status, results } = data;

    if (status === 'pending' || status === 'running') {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Status: {status}...</span>
        </div>
      );
    }

    if (status === 'failed') {
        return <Alert variant="destructive">
          <AlertTitle>Sync Failed</AlertTitle>
          <AlertDescription>The sync job failed to complete.</AlertDescription>
        </Alert>;
    }

    if (status === 'completed' && results.length === 0) {
      return <Alert>
        <AlertTitle>Sync Complete</AlertTitle>
        <AlertDescription>No new unique emails were found.</AlertDescription>
      </Alert>;
    }

    if (status === 'completed' && results.length > 0) {
      return (
        <>
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Sync Complete!</AlertTitle>
            <AlertDescription className="text-green-700">Found {results.length} unique emails.</AlertDescription>
          </Alert>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((email: string, index: number) => (
                  <TableRow key={index}>
                    <TableCell>{email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Sync Job Results</CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default ResultsDisplay;
