import React, { createContext, useContext, useRef, useState, useEffect, ReactNode } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from 'sonner';

// Define the sync progress event type (same as in WebSocketContext)
export interface SyncProgressEvent {
  type: 'SYNC_STARTED' | 'SYNC_PROGRESS' | 'SYNC_MESSAGE_COUNT' | 'SYNC_COMPLETED' | 'SYNC_FAILED';
  payload: {
    syncJobId: string;
    accountId: string;
    email?: string;
    currentFolder?: string;
    processed?: number;
    total?: number;
    messageCount?: number;
    totalMessages?: number;
    error?: string;
  };
}

// Define the context type
interface SupabaseRealtimeContextType {
  isConnected: boolean;
  lastMessage: SyncProgressEvent | null;
  sendMessage: (message: any) => void;
}

// Create the context
const SupabaseRealtimeContext = createContext<SupabaseRealtimeContextType | null>(null);

interface SupabaseRealtimeProviderProps {
  children: ReactNode;
}

export const SupabaseRealtimeProvider: React.FC<SupabaseRealtimeProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SyncProgressEvent | null>(null);
  
  // Keep track of channels
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const isInitializedRef = useRef(false);

  // Initialize Supabase real-time connections
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      console.error('Supabase is not properly configured. Check your environment variables.');
      return;
    }

    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Create and subscribe to the sync-progress channel
    const syncProgressChannel = supabase.channel('sync-progress');
    
    syncProgressChannel
      .on('broadcast', { event: 'progress-update' }, (payload) => {
        console.log('Received sync progress update:', payload);
        
        // Extract data from the payload
        const { syncJobId, progress, message, timestamp } = payload.payload;
        
        // Map to the expected format for backward compatibility
        const syncEvent: SyncProgressEvent = {
          type: 'SYNC_PROGRESS',
          payload: {
            syncJobId,
            accountId: '', // Will be populated from database sync job data if needed
            processed: progress,
            total: 100, // Normalize to percentage
            currentFolder: message,
          }
        };
        
        setLastMessage(syncEvent);
      })
      .subscribe((status) => {
        console.log('Sync progress channel status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });
    
    // Create and subscribe to the general channel for other events
    const generalChannel = supabase.channel('general');
    
    generalChannel
      .on('broadcast', { event: 'SYNC_STARTED' }, (payload) => {
        console.log('Received SYNC_STARTED event:', payload);
        setLastMessage({
          type: 'SYNC_STARTED',
          payload: payload.payload
        });
      })
      .on('broadcast', { event: 'SYNC_MESSAGE_COUNT' }, (payload) => {
        console.log('Received SYNC_MESSAGE_COUNT event:', payload);
        setLastMessage({
          type: 'SYNC_MESSAGE_COUNT',
          payload: payload.payload
        });
      })
      .on('broadcast', { event: 'SYNC_COMPLETED' }, (payload) => {
        console.log('Received SYNC_COMPLETED event:', payload);
        setLastMessage({
          type: 'SYNC_COMPLETED',
          payload: payload.payload
        });
      })
      .on('broadcast', { event: 'SYNC_FAILED' }, (payload) => {
        console.log('Received SYNC_FAILED event:', payload);
        setLastMessage({
          type: 'SYNC_FAILED',
          payload: payload.payload
        });
      })
      .subscribe((status) => {
        console.log('General channel status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });
    
    // Store channels for cleanup
    channelsRef.current.set('sync-progress', syncProgressChannel);
    channelsRef.current.set('general', generalChannel);
    
    // Also subscribe to database changes for sync_jobs table
    const syncJobsChannel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sync_jobs',
        },
        (payload) => {
          console.log('Sync job updated:', payload);
          const { new: newJob } = payload;
          
          // Map database update to event format if needed
          if (newJob.status === 'completed') {
            setLastMessage({
              type: 'SYNC_COMPLETED',
              payload: {
                syncJobId: newJob.id,
                accountId: newJob.account_id,
              }
            });
          } else if (newJob.status === 'failed') {
            setLastMessage({
              type: 'SYNC_FAILED',
              payload: {
                syncJobId: newJob.id,
                accountId: newJob.account_id,
                error: newJob.error_message,
              }
            });
          }
        }
      )
      .subscribe();
    
    channelsRef.current.set('db-changes', syncJobsChannel);

    // Cleanup function
    return () => {
      for (const [name, channel] of channelsRef.current.entries()) {
        console.log(`Unsubscribing from channel: ${name}`);
        channel.unsubscribe();
      }
      channelsRef.current.clear();
      isInitializedRef.current = false;
      setIsConnected(false);
    };
  }, []);

  // Send message function (for backward compatibility)
  const sendMessage = (message: any) => {
    if (!isSupabaseConfigured()) {
      console.error('Cannot send message: Supabase is not properly configured');
      return;
    }

    // For backward compatibility, map WebSocket messages to Supabase broadcast
    const generalChannel = channelsRef.current.get('general');
    if (generalChannel && isConnected) {
      generalChannel.send({
        type: 'broadcast',
        event: message.type || 'message',
        payload: message,
      });
    } else {
      console.warn('Cannot send message: Channel not ready or not connected');
    }
  };

  return (
    <SupabaseRealtimeContext.Provider value={{ isConnected, lastMessage, sendMessage }}>
      {children}
    </SupabaseRealtimeContext.Provider>
  );
};

// Hook for using the context
export const useSupabaseRealtimeContext = () => {
  const context = useContext(SupabaseRealtimeContext);
  if (!context) {
    throw new Error('useSupabaseRealtimeContext must be used within a SupabaseRealtimeProvider');
  }
  return context;
};

// Backward compatibility hook - allows drop-in replacement
export const useWebSocketContext = useSupabaseRealtimeContext;
