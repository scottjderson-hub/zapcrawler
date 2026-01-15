import React, { createContext, useContext, useRef, useState, useEffect, ReactNode } from 'react';

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

interface WebSocketContextType {
  isConnected: boolean;
  lastMessage: SyncProgressEvent | null;
  sendMessage: (message: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  url: string;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children, url }) => {
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
        
        // Send a ping to keep connection alive
        const pingInterval = setInterval(() => {
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          } else {
            clearInterval(pingInterval);
          }
        }, 25000); // Send ping every 25 seconds (before server's 30s timeout)
        
        // Store interval reference for cleanup
        (ws.current as any).pingInterval = pingInterval;
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Only process sync progress events, ignore ping/pong and connection messages
          if (data.type && ['SYNC_STARTED', 'SYNC_PROGRESS', 'SYNC_MESSAGE_COUNT', 'SYNC_COMPLETED', 'SYNC_FAILED'].includes(data.type)) {
            const syncEvent = data as SyncProgressEvent;
            // Ensure the message has the expected payload structure
            if (syncEvent.payload && syncEvent.payload.syncJobId) {
              setLastMessage(syncEvent);
            }
          }
          // Ignore other message types (ping, pong, connection_established, etc.)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed');
        setIsConnected(false);
        isReconnecting.current = false;
        
        // Clear ping interval if it exists
        if ((ws.current as any)?.pingInterval) {
          clearInterval((ws.current as any).pingInterval);
        }
        
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

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
