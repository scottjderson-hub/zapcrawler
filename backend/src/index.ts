import 'dotenv/config';
import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { logger } from './utils/logger';
import connectDB from './config/database';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/api';
import { setupWebSocket } from './services/websocket';
// Auto-start the email worker
import './workers/emailWorker';

const app = express();

const PORT = process.env.PORT || 3001;


// HTTP Server
const server = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });
setupWebSocket(wss);

server.on('upgrade', (request: IncomingMessage, socket, head) => {
  const origin = request.headers.origin || '';
  const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:8080', 'http://localhost:5173', 'http://localhost:8081'];

  if (!allowedOrigins.includes(origin)) {
    logger.warn(`WebSocket connection from origin ${origin} rejected.`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  logger.info(`WebSocket connection from origin ${origin} allowed.`);
  wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    wss.emit('connection', ws, request);
  });
});

// Security Middleware - Configure helmet to allow Supabase connections
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'", 
        "https://amakhxbunjvmtrnixhkk.supabase.co",
        "wss://amakhxbunjvmtrnixhkk.supabase.co",
        "http://localhost:3001",
        "https://*.railway.app",
        "https://dns.google"
      ],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    // In development, we can allow all origins. 
    // For production, you should have a whitelist of allowed origins.
    logger.info(`CORS check for origin: ${origin}`);
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Configure trust proxy for Railway deployment
app.set('trust proxy', true);

// Rate Limiting - More generous limits for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10), // Increased from 100 to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development for /api/sync/jobs specifically
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.path.includes('/api/sync/jobs');
  }
});

app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', apiRouter);

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../dist');
  app.use(express.static(frontendPath));
  
  // Handle React Router - serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
} else {
  // 404 Handler for development
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });
}

// Error Handler
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`WebSocket server is attached to the HTTP server.`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful Shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  server.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server during shutdown:', err);
      process.exit(1);
    } else {
      logger.info('HTTP server closed.');
      wss.close((wsErr) => {
        if (wsErr) {
          logger.error('Error closing WebSocket server during shutdown:', wsErr);
          process.exit(1);
        } else {
          logger.info('WebSocket server closed.');
          logger.info('Graceful shutdown complete.');
          process.exit(0);
        }
      });
    }
  });
};

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { error: err });
  gracefulShutdown('unhandledRejection');
});

// Handle uncaught exceptions without shutdown for IMAP timeouts
process.on('uncaughtException', (err: Error) => {
  // Don't crash the app for IMAP socket timeouts - just log and continue
  const errorCode = (err as any).code;
  const errorMessage = err.message || '';
  
  // Handle common non-fatal network and proxy errors
  if (errorMessage.includes('Socket timeout') || 
      errorCode === 'ETIMEOUT' ||
      errorMessage.includes('Cannot read properties of null') ||
      errorMessage.includes('statusCode') ||
      errorMessage.includes('undici') ||
      errorMessage.includes('SOCKS') ||
      errorMessage.includes('proxy')) {
    logger.error(`Network/Proxy Error (non-fatal): ${errorMessage}`, { 
      error: { code: errorCode, message: errorMessage },
      stack: err.stack 
    });
    return; // Continue running instead of shutting down
  }
  
  // For other uncaught exceptions, still perform graceful shutdown
  logger.error(`Uncaught Exception: ${err.stack}`, { error: err });
  gracefulShutdown('uncaughtException');
});

export { app, server, wss };
