import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../utils/logger';

interface Client extends WebSocket {
  id: string;
  isAlive: boolean;
}

const clients = new Map<string, Client>();

export const setupWebSocket = (wss: WebSocketServer) => {
  // Handle new connections
  wss.on('connection', (ws: Client, req) => {
    const clientId = req.headers['sec-websocket-key'] || Date.now().toString();
    ws.id = clientId;
    ws.isAlive = true;
    
    // Add to clients map
    clients.set(clientId, ws);
    logger.info(`Client connected: ${clientId}`);
    
    // Handle messages
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        
        // Handle ping messages to keep connection alive
        if (data.type === 'ping') {
          ws.isAlive = true;
          // Send pong response
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
        
        logger.debug('Received message:', data);
        // Handle other message types here
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
      }
    });
    
    // Handle pings
    ws.on('pong', () => {
      (ws as Client).isAlive = true;
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      clients.delete(clientId);
      logger.info(`Client disconnected: ${clientId}`);
    });
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      clientId,
      timestamp: new Date().toISOString()
    }));
  });
  
  // Heartbeat to check for dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as Client;
      if (!client.isAlive) {
        client.terminate();
        clients.delete(client.id);
        return;
      }
      
      client.isAlive = false;
      client.ping();
    });
  }, 30000);
  
  // Cleanup on server close
  wss.on('close', () => {
    clearInterval(interval);
  });
};

// Send message to all connected clients
export const broadcast = (data: any) => {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Send message to a specific client
export const sendToClient = (clientId: string, data: any) => {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    client.send(message);
    return true;
  }
  return false;
};
