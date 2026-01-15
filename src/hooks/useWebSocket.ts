import { useEffect, useRef, useState } from 'react';

export interface SyncProgressEvent {
  type: 'SYNC_PROGRESS' | 'SYNC_STARTED' | 'SYNC_COMPLETED' | 'SYNC_FAILED' | 'SYNC_MESSAGE_COUNT';
  payload: {
    syncJobId: string;
    accountId: string;
    email?: string;
    folder?: string;
    processed?: number;
    total?: number;
    status?: 'syncing' | 'completed' | 'error';
    error?: string;
    messageCount?: number;
    totalMessages?: number;
    folders?: string[];
  };
}

export const useWebSocket = (url: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SyncProgressEvent | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isReconnecting = useRef(false);
  const shouldReconnect = useRef(true);

  const getReconnectDelay = (attempt: number) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * Math.pow(2, attempt), 16000);
  };

  const connect = () => {
    // Prevent multiple simultaneous connection attempts
    if (isReconnecting.current || !shouldReconnect.current) {
      return;
    }

    isReconnecting.current = true;

    try {
      // Close existing connection if any
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }

      ws.current = new WebSocket(url);
      
      ws.current.onopen = () => {
        console.log('WebSocket connection established');
        setIsConnected(true);
        reconnectAttempts.current = 0; // Reset attempts on successful connection
        isReconnecting.current = false;
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SyncProgressEvent;
          setLastMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed');
        setIsConnected(false);
        isReconnecting.current = false;
        
        // Only attempt to reconnect if it wasn't a manual close and we haven't exceeded max attempts
        if (shouldReconnect.current && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = getReconnectDelay(reconnectAttempts.current);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.warn('Max WebSocket reconnection attempts reached. Stopping reconnection.');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        isReconnecting.current = false;
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      isReconnecting.current = false;
    }
  };

  useEffect(() => {
    shouldReconnect.current = true;
    connect();

    return () => {
      // Prevent any further reconnection attempts
      shouldReconnect.current = false;
      
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close WebSocket connection
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }
      
      // Reset state
      setIsConnected(false);
      isReconnecting.current = false;
      reconnectAttempts.current = 0;
    };
  }, [url]);

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  return {
    isConnected,
    lastMessage,
    sendMessage
  };
};
