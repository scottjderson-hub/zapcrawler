import tls from 'tls';
import net from 'net';
import { SocksClient } from 'socks';
import { ImapFlow, FetchMessageObject, MessageEnvelopeObject, MessageAddressObject as ImapMessageAddressObject } from 'imapflow';
import { BaseProtocolHandler } from './base';
import { EmailMessage, EmailFolder, SyncOptions, EmailAddress, EmailAttachment } from '../../types/email';
import { logger } from '../../utils/logger';

interface ImapAuth {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  authTimeout?: number;
}

interface BatchConfig {
  enabled: boolean;
  batchSize: number;
  progressUpdateInterval: number;
  maxConcurrentBatches: number;
}

export class ImapHandler extends BaseProtocolHandler {
  private client: ImapFlow | null = null;
  private batchConfig: BatchConfig = {
    enabled: process.env.IMAP_BATCH_ENABLED === 'true',
    batchSize: parseInt(process.env.IMAP_BATCH_SIZE || '1000'), // Smaller batches for large servers
    progressUpdateInterval: parseInt(process.env.IMAP_PROGRESS_INTERVAL || '50'), // More frequent progress updates
    maxConcurrentBatches: parseInt(process.env.IMAP_MAX_CONCURRENT_BATCHES || '1')
  };
  private lastActivity: number = Date.now();
  private authCredentials: ImapAuth | null = null; // Store auth for reconnection
  private connectionRetries: number = 0;
  private maxRetries: number = 3;

  /**
   * Wrapper for operations with timeout handling
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation '${operation}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('timed out')) {
        logger.warn(`⏰ ${operation} timed out, will retry with smaller batch size`);
        throw new Error(`FETCH_TIMEOUT: ${(error as Error).message}`);
      }
      throw error;
    }
  }

  /**
   * Check and maintain connection health for long operations with auto-recovery
   */
  private async ensureConnectionHealth(): Promise<void> {
    // Check if connection is available
    if (!this.client || !this.client.usable) {
      logger.warn('🔄 IMAP connection lost or not usable, attempting reconnection...');
      await this.reconnectWithBackoff();
      return;
    }
    
    const timeSinceLastActivity = Date.now() - this.lastActivity;
    this.lastActivity = Date.now();

    // If more than 30 seconds since last activity, send NOOP to keep connection alive
    // This helps prevent proxy timeouts and server idle disconnects
    if (timeSinceLastActivity > 30000) { // 30 seconds
      try {
        logger.debug('Sending NOOP to maintain connection health');
        await this.client.noop();
        logger.debug('NOOP successful - connection is healthy');
        this.connectionRetries = 0; // Reset retry counter on successful operation
      } catch (error) {
        logger.warn('NOOP failed, connection may be stale:', error);
        // Attempt reconnection
        await this.reconnectWithBackoff();
      }
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnectWithBackoff(): Promise<void> {
    if (this.connectionRetries >= this.maxRetries) {
      throw new Error(`Failed to reconnect after ${this.maxRetries} attempts`);
    }

    if (!this.authCredentials) {
      throw new Error('No stored credentials available for reconnection');
    }

    this.connectionRetries++;
    const backoffDelay = Math.min(1000 * Math.pow(2, this.connectionRetries - 1), 30000); // Max 30s
    
    logger.info(`🔄 Attempting reconnection ${this.connectionRetries}/${this.maxRetries} after ${backoffDelay}ms delay...`);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    
    try {
      // Clean up existing client
      if (this.client) {
        try {
          await this.client.logout();
        } catch (error) {
          // Ignore logout errors if connection is already dead
          logger.debug('Ignoring logout error during reconnection:', error);
        }
        this.client = null;
      }
      
      // Reconnect
      this.connected = false;
      await this.connect(this.authCredentials);
      
      logger.info(`✅ Successfully reconnected on attempt ${this.connectionRetries}`);
      this.connectionRetries = 0; // Reset on successful reconnection
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Reconnection attempt ${this.connectionRetries} failed:`, error);
      
      if (this.connectionRetries >= this.maxRetries) {
        throw new Error(`Connection recovery failed after ${this.maxRetries} attempts: ${errorMessage}`);
      }
      
      // Recursive retry
      await this.reconnectWithBackoff();
    }
  }

  async connect(auth: any): Promise<boolean> {
    const originalTlsConnect = tls.connect;
    const needsProxy = auth.proxy && auth.proxy.host;
    
    // Store credentials for reconnection
    this.authCredentials = auth;
    
    if (this.connected && this.client && this.client.usable) {
      logger.debug('IMAP connection already established.');
      return true;
    }

    const connectionInfo = `IMAP server: ${auth.host}:${auth.port} (TLS: ${auth.secure})`;
    logger.debug(`Attempting to connect to ${connectionInfo}`);
    if (needsProxy) {
      logger.info(`Using SOCKS proxy: ${auth.proxy.host}:${auth.proxy.port} (type: ${auth.proxy.type})`);
    }

    if (needsProxy) {
      (tls as any).connect = (options: any, connectionListener?: () => void) => {
        logger.info('TLS connect intercepted, establishing proxy connection.');
        logger.debug(`TLS options received: servername=${options.servername}, host=${options.host}`);

        let tlsSocket: tls.TLSSocket;
        try {
          // Ensure servername is set for SNI
          const socketOptions = {
            ...options,
            servername: options.servername || auth.host
          };
          tlsSocket = new tls.TLSSocket(new net.Socket(), socketOptions);
          
          // Add comprehensive error handling for the TLS socket
          tlsSocket.on('error', (err) => {
            logger.error('TLS socket error:', err);
          });
          
          tlsSocket.on('close', (hadError) => {
            if (hadError) {
              logger.warn('TLS socket closed with error');
            }
          });
          
        } catch (err) {
          logger.error('Error creating TLS socket:', err);
          throw err;
        }

        // Map proxy type correctly for SOCKS library
        let socksType: 4 | 5 = 5; // Default to SOCKS5
        if (auth.proxy.type === 4 || auth.proxy.type === 'SOCKS4') {
          socksType = 4;
        } else if (auth.proxy.type === 5 || auth.proxy.type === 'SOCKS5') {
          socksType = 5;
        }
        // Note: HTTP proxies (type 1) not supported by SocksClient
        
        console.log(`🔍 IMAP Handler: Mapping proxy type '${auth.proxy.type}' to SOCKS type ${socksType}`);
        console.log(`🔐 SOCKS5 Auth: userId='${auth.proxy.userId}', password length=${auth.proxy.password?.length || 0}`);
        
        SocksClient.createConnection({
          proxy: {
            host: auth.proxy.host,
            port: auth.proxy.port,
            type: socksType,
            userId: auth.proxy.userId,
            password: auth.proxy.password,
          },
          command: 'connect',
          destination: {
            host: options.host || auth.host,
            port: options.port || auth.port,
          },
        })
          .then(info => {
            logger.info('SOCKS connection established. Passing proxied socket to original tls.connect.');
            try {
              // Include servername for SNI support when using proxy
              const tlsOptions = {
                ...options,
                socket: info.socket,
                servername: options.servername || auth.host
              };
              logger.debug(`Proxy TLS options: servername=${tlsOptions.servername}, host=${tlsOptions.host}`);
              const realTlsSocket = originalTlsConnect(tlsOptions, connectionListener);
              
              // Add error handling wrapper for all event forwarding
              const safeEmit = (event: string, ...args: any[]) => {
                try {
                  tlsSocket.emit(event, ...args);
                } catch (err) {
                  logger.error(`Error emitting ${event} event:`, err);
                }
              };
              
              // Forward events from the real socket to the placeholder with error protection
              realTlsSocket.on('data', (data) => safeEmit('data', data));
              realTlsSocket.on('secureConnect', () => {
                logger.debug('Real TLS socket secureConnect event - handshake successful');
                logger.debug(`TLS version: ${realTlsSocket.getProtocol()}, cipher: ${realTlsSocket.getCipher()?.name}`);
                safeEmit('secureConnect');
              });
              realTlsSocket.on('end', () => {
                logger.debug('Real TLS socket end event');
                safeEmit('end');
              });
              realTlsSocket.on('error', (err) => {
                logger.error('Real TLS socket error:', err);
                safeEmit('error', err);
              });
              realTlsSocket.on('close', (hadError) => {
                logger.debug(`Real TLS socket close event (hadError: ${hadError})`);
                safeEmit('close');
              });

              // Forward writes from the placeholder to the real socket with error protection
              (tlsSocket as any).write = (...args: any[]) => {
                try {
                  return (realTlsSocket.write as (...args: any[]) => boolean).apply(realTlsSocket, args);
                } catch (err) {
                  logger.error('Error writing to real TLS socket:', err);
                  return false;
                }
              };
            } catch (err) {
              logger.error('Error setting up TLS socket forwarding:', err);
              tlsSocket.emit('error', err);
            }
          })
          .catch(err => {
            logger.error('SOCKS connection failed:', err);
            tlsSocket.emit('error', err);
          });

        return tlsSocket;
      };
    }

    this.client = new ImapFlow({
      host: auth.host,
      port: auth.port,
      secure: auth.secure,
      auth: {
        user: auth.user,
        pass: auth.pass,
      },
      // TLS options to handle connection and certificate issues
      tls: {
        rejectUnauthorized: false,   // Allow self-signed or mismatched certificates
        minVersion: 'TLSv1.2',       // Use TLS 1.2+ for better compatibility with modern servers
        maxVersion: 'TLSv1.3',       // Allow up to TLS 1.3
        servername: auth.host,       // Enable SNI for TLS (required by some servers like Comcast)
        ciphers: 'HIGH:!aNULL:!MD5'  // Use strong ciphers that Comcast accepts
      } as any,
      // Reduced timeout configurations for better error handling
      socketTimeout: 600000,      // 10 minutes for socket operations (reduced from 30min)
      connectionTimeout: 180000,  // 3 minutes for initial connection (reduced from 5min)
      // Authentication timeout is handled by socketTimeout
      // Enable detailed logging from imapflow to see raw commands
      logger: {
        debug: (msg) => logger.debug(`[imapflow-raw] ${msg}`),
        info: (msg) => logger.info(`[imapflow-raw] ${msg}`),
        warn: (msg) => logger.warn(`[imapflow-raw] ${msg}`),
        error: (msg) => logger.error(`[imapflow-raw] ${msg}`),
      },
    });

    // Add error handling to prevent uncaught exceptions from crashing the app
    this.client.on('error', (error) => {
      logger.error(`IMAP client error (handled):`, error);
      // Don't throw - just log the error and let reconnection logic handle it
      this.connected = false;
    });

    // Handle socket timeouts and connection closures
    this.client.on('close', () => {
      logger.warn('IMAP connection closed unexpectedly');
      this.connected = false;
    });

    try {
      const connectStartTime = Date.now();
      logger.debug('IMAP client.connect() called.');
      await this.client.connect();
      const connectTime = Date.now() - connectStartTime;

      logger.debug(`IMAP connection successful. (Took ${connectTime}ms)`);
      this.connected = true;
      this.emit('connected');
      return true;
    } catch (error) {
      logger.error(`❌ IMAP connection failed for ${connectionInfo}:`, error);
      this.connected = false;
      this.client = null;
      throw error;
    } finally {
      if (needsProxy) {
        tls.connect = originalTlsConnect;
        logger.info('Restored original tls.connect function.');
      }
    }
  }
  
  async testConnection(auth: any): Promise<boolean> {
    try {
      await this.connect(auth);
      return true;
    } catch (error) {
      return false;
    } finally {
      if (this.client && this.client.usable) {
        await this.disconnect();
      }
    }
  }
  
  async getFolders(): Promise<EmailFolder[]> {
    if (!this.client) {
      logger.error('getFolders called but not connected to IMAP server.');
      throw new Error('Not connected to IMAP server');
    }

    logger.debug('Fetching IMAP folder list...');
    const startTime = Date.now();

    try {
      const folderList = await this.client.list();
      logger.debug(`IMAP folder list fetched successfully. (${folderList.length} folders)`);

      // For large mailboxes, process folders in chunks to prevent timeouts
      const CHUNK_SIZE = 10; // Process 10 folders at a time
      const CHUNK_DELAY = 100; // 100ms delay between chunks
      const foldersWithCounts = [];
      let processedCount = 0;
      
      logger.debug(`Processing ${folderList.length} folders in chunks of ${CHUNK_SIZE} with ${CHUNK_DELAY}ms delays`);
      
      // Process folders in chunks
      for (let i = 0; i < folderList.length; i += CHUNK_SIZE) {
        const chunk = folderList.slice(i, i + CHUNK_SIZE);
        logger.debug(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(folderList.length/CHUNK_SIZE)} (folders ${i+1}-${Math.min(i+CHUNK_SIZE, folderList.length)})`);
        
        // Process chunk in parallel with limited concurrency
        const chunkPromises = chunk.map(async (folder) => {
          try {
            // Get folder status to get message count
            const status = await this.client!.status(folder.path, { messages: true, unseen: true });
            logger.debug(`Folder "${folder.path}": ${status.messages || 0} messages, ${status.unseen || 0} unseen`);
            
            return {
              ...folder,
              flags: Array.from(folder.flags),
              specialUse: folder.specialUse ? [folder.specialUse] : [],
              messages: status.messages || 0,
              unseen: status.unseen || 0,
            };
          } catch (error) {
            logger.warn(`Could not get status for folder "${folder.path}":`, error);
            return {
              ...folder,
              flags: Array.from(folder.flags),
              specialUse: folder.specialUse ? [folder.specialUse] : [],
              messages: 0,
              unseen: 0,
            };
          }
        });
        
        // Wait for chunk to complete
        const chunkResults = await Promise.all(chunkPromises);
        foldersWithCounts.push(...chunkResults);
        
        processedCount += chunk.length;
        
        // Emit progress update for chunk completion
        this.emit('folderProgress', { processed: processedCount, total: folderList.length });
        logger.debug(`Chunk completed: ${processedCount}/${folderList.length} folders processed`);
        
        // Add delay between chunks to prevent overwhelming the server (except for last chunk)
        if (i + CHUNK_SIZE < folderList.length) {
          await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
        }
      }

      const duration = Date.now() - startTime;
      logger.debug(`IMAP folder list with counts completed. (took ${duration}ms)`);
      
      return this.normalizeFolders(foldersWithCounts);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Error fetching IMAP folders (took ${duration}ms):`, error);
      throw error;
    }
  }
  
  async *syncMessages(options: SyncOptions): AsyncGenerator<EmailMessage> {
    if (!this.client) {
      logger.error('syncMessages called but not connected to IMAP server.');
      throw new Error('Not connected to IMAP server');
    }

    const { folders = ['INBOX'], since } = options;
    logger.debug(`Starting IMAP sync for folders: [${folders.join(', ')}] (Batch processing: ${this.batchConfig.enabled ? 'ENABLED' : 'DISABLED'})`);

    for (const folderPath of folders) {
      const folderStartTime = Date.now();
      let lastProcessedSeq = 0; // Track last successfully processed message sequence number
      let totalMessages = 0;
      let retryCount = 0;
      const maxRetries = 5;

      logger.debug(`Opening IMAP mailbox: "${folderPath}"`);

      // Retry loop for this folder in case of connection drops
      while (retryCount < maxRetries) {
        try {
          await this.client.mailboxOpen(folderPath);
          logger.debug(`IMAP mailbox "${folderPath}" opened successfully.`);

          const total = await this.client.status(folderPath, { messages: true });
          totalMessages = total.messages || 0;

          if (lastProcessedSeq === 0) {
            logger.debug(`Found ${totalMessages} total messages in "${folderPath}".`);
          } else {
            logger.info(`Resuming folder "${folderPath}" from message ${lastProcessedSeq + 1} of ${totalMessages}`);
          }

          this.emitProgress({
            processed: lastProcessedSeq,
            total: totalMessages,
            folder: folderPath,
            status: 'syncing'
          });

          // Skip fetching if folder is empty
          if (totalMessages === 0) {
            logger.debug(`Folder "${folderPath}" is empty, skipping fetch operation.`);
            this.emitProgress({
              processed: 0,
              total: 0,
              folder: folderPath,
              status: 'completed'
            });
            break; // Exit retry loop, move to next folder
          }

          // Skip if we've already processed all messages
          if (lastProcessedSeq >= totalMessages) {
            logger.info(`All messages in "${folderPath}" already processed. Moving to next folder.`);
            this.emitProgress({
              processed: totalMessages,
              total: totalMessages,
              folder: folderPath,
              status: 'completed'
            });
            break; // Exit retry loop, move to next folder
          }

          // Choose processing method based on configuration
          let processedInThisAttempt = 0;
          if (this.batchConfig.enabled && totalMessages > this.batchConfig.batchSize) {
            logger.debug(`Using BATCH processing for ${totalMessages} messages (batch size: ${this.batchConfig.batchSize})`);
            for await (const email of this.syncMessagesBatchedResumable(folderPath, totalMessages, since, lastProcessedSeq)) {
              processedInThisAttempt++;
              lastProcessedSeq++;
              yield email;
            }
          } else {
            logger.debug(`Using LEGACY processing for ${totalMessages} messages`);
            for await (const email of this.syncMessagesLegacyResumable(folderPath, totalMessages, since, lastProcessedSeq)) {
              processedInThisAttempt++;
              lastProcessedSeq++;
              yield email;
            }
          }

          const folderDuration = Date.now() - folderStartTime;
          logger.debug(`Completed sync for "${folderPath}". (Took ${folderDuration}ms)`);

          this.emitProgress({
            processed: totalMessages,
            total: totalMessages,
            folder: folderPath,
            status: 'completed'
          });

          break; // Successfully completed, exit retry loop

        } catch (error: any) {
          const folderDuration = Date.now() - folderStartTime;
          logger.error(`❌ Error syncing IMAP folder "${folderPath}" (took ${folderDuration}ms):`, error);

          // Check if it's a connection error that we can recover from
          if (error.code === 'NoConnection' || error.message?.includes('Connection not available') || error.message?.includes('Connection closed')) {
            retryCount++;
            logger.warn(`Connection lost during sync of "${folderPath}" after processing ${lastProcessedSeq}/${totalMessages} messages. Attempt ${retryCount}/${maxRetries}`);

            if (retryCount >= maxRetries) {
              logger.error(`❌ Max retries (${maxRetries}) reached for folder "${folderPath}". Processed ${lastProcessedSeq}/${totalMessages} messages.`);
              this.emitProgress({
                processed: lastProcessedSeq,
                total: totalMessages,
                folder: folderPath,
                status: 'error',
                error: `Max retries reached. Processed ${lastProcessedSeq}/${totalMessages} messages.`
              });
              break; // Exit retry loop, move to next folder with partial results
            }

            try {
              // Attempt reconnection
              await this.reconnectWithBackoff();
              logger.info(`✅ Reconnected successfully. Resuming folder "${folderPath}" from message ${lastProcessedSeq + 1}...`);
              // Continue retry loop to resume from where we left off
            } catch (reconnectError) {
              logger.error(`❌ Failed to reconnect after connection loss:`, reconnectError);
              throw reconnectError; // Give up on this sync job entirely
            }
          } else {
            // Non-connection error, don't retry
            this.emitProgress({
              processed: lastProcessedSeq,
              total: totalMessages,
              folder: folderPath,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
          }
        }
      }
    }
    logger.debug('IMAP sync for all requested folders completed.');
  }

  /**
   * Resumable legacy message processing - can start from a specific sequence number
   */
  private async *syncMessagesLegacyResumable(folderPath: string, totalMessages: number, since?: Date, startSeq: number = 0): AsyncGenerator<EmailMessage> {
    let processed = startSeq;

    // Build search criteria to resume from where we left off
    const startMsg = startSeq + 1; // IMAP uses 1-based indexing
    const searchCriteria = since ? { since: since, seq: `${startMsg}:*` } : `${startMsg}:*`;

    logger.debug(`Fetching messages from "${folderPath}" starting at #${startMsg} with criteria:`, searchCriteria);

    try {
      const messages = this.client!.fetch(searchCriteria, { envelope: true, uid: true });

      for await (const message of messages) {
        // Check connection health periodically (every 100 messages)
        if (processed > 0 && processed % 100 === 0) {
          try {
            await this.ensureConnectionHealth();
          } catch (healthError) {
            logger.error(`Failed to maintain connection health after ${processed} messages:`, healthError);
            // Try to reopen folder after potential reconnection
            try {
              await this.client!.mailboxOpen(folderPath);
            } catch (reopenError) {
              logger.error(`Failed to reopen folder after reconnection:`, reopenError);
              throw reopenError;
            }
          }
        }

        processed++;
        if (!message.envelope) {
          logger.warn(`Skipping message UID ${message.uid} in "${folderPath}" due to missing envelope.`);
          continue;
        }
        const envelope = message.envelope;
      const email: EmailMessage = {
        id: message.uid.toString(),
        subject: envelope.subject || '',
        from: envelope.from?.[0] ? { name: envelope.from[0].name || '', address: envelope.from[0].address || '' } : { address: 'unknown' },
        to: envelope.to?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        cc: envelope.cc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        bcc: envelope.bcc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        date: envelope.date || new Date(),
        folder: folderPath,
        body: '', // Not fetching body for performance
      };

        this.emitProgress({
          processed,
          total: totalMessages,
          folder: folderPath,
          status: 'syncing'
        });

        yield email;
      }
    } catch (error: any) {
      // If connection dropped during fetch, log it and throw to trigger retry
      if (error.code === 'NoConnection' || error.message?.includes('Connection not available')) {
        logger.warn(`Connection dropped after processing ${processed}/${totalMessages} messages in "${folderPath}"`);
        throw error; // Let the outer handler deal with reconnection and retry
      }
      throw error;
    }
  }

  /**
   * Legacy message processing (deprecated - use resumable version)
   * Maintained for backwards compatibility
   */
  private async *syncMessagesLegacy(folderPath: string, totalMessages: number, since?: Date): AsyncGenerator<EmailMessage> {
    let processed = 0;
    const searchCriteria = since ? { since: since } : '1:*';
    logger.debug(`Fetching messages from "${folderPath}" with criteria:`, searchCriteria);

    try {
      const messages = this.client!.fetch(searchCriteria, { envelope: true, uid: true });

      for await (const message of messages) {
        // Check connection health periodically (every 100 messages)
        if (processed > 0 && processed % 100 === 0) {
          try {
            await this.ensureConnectionHealth();
          } catch (healthError) {
            logger.error(`Failed to maintain connection health after ${processed} messages:`, healthError);
            // Try to reopen folder after potential reconnection
            try {
              await this.client!.mailboxOpen(folderPath);
            } catch (reopenError) {
              logger.error(`Failed to reopen folder after reconnection:`, reopenError);
              throw reopenError;
            }
          }
        }

        processed++;
        if (!message.envelope) {
          logger.warn(`Skipping message UID ${message.uid} in "${folderPath}" due to missing envelope.`);
          continue;
        }
        const envelope = message.envelope;
      const email: EmailMessage = {
        id: message.uid.toString(),
        subject: envelope.subject || '',
        from: envelope.from?.[0] ? { name: envelope.from[0].name || '', address: envelope.from[0].address || '' } : { address: 'unknown' },
        to: envelope.to?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        cc: envelope.cc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        bcc: envelope.bcc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
        date: envelope.date || new Date(),
        folder: folderPath,
        body: '', // Not fetching body for performance
      };

        this.emitProgress({
          processed,
          total: totalMessages,
          folder: folderPath,
          status: 'syncing'
        });

        yield email;
      }
    } catch (error: any) {
      // If connection dropped during fetch, log it but don't crash
      if (error.code === 'NoConnection' || error.message?.includes('Connection not available')) {
        logger.warn(`Connection dropped after processing ${processed}/${totalMessages} messages in "${folderPath}"`);
        throw error; // Let the outer handler deal with reconnection
      }
      throw error;
    }
  }

  /**
   * Resumable batched message processing - can start from a specific sequence number
   */
  private async *syncMessagesBatchedResumable(folderPath: string, totalMessages: number, since?: Date, startSeq: number = 0): AsyncGenerator<EmailMessage> {
    const batchSize = this.batchConfig.batchSize;
    const progressInterval = this.batchConfig.progressUpdateInterval;
    let totalProcessed = startSeq;

    logger.debug(`Starting batched processing: ${totalMessages} messages in batches of ${batchSize}, resuming from ${startSeq}`);

    // Calculate message range to fetch, starting from where we left off
    const startUid = startSeq + 1; // IMAP uses 1-based indexing
    const endUid = totalMessages;

    // Process messages in batches
    for (let batchStart = startUid; batchStart <= endUid; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endUid);
      const batchCriteria = since ? { since: since, seq: `${batchStart}:${batchEnd}` } : `${batchStart}:${batchEnd}`;

      logger.debug(`Processing batch: Messages ${batchStart}-${batchEnd} (${batchEnd - batchStart + 1} messages)`);

      try {
        // Check connection health before each batch
        await this.ensureConnectionHealth();

        // Fetch messages for this batch
        const messages = this.client!.fetch(batchCriteria, { envelope: true, uid: true });
        let batchProcessed = 0;

        for await (const message of messages) {
          batchProcessed++;
          totalProcessed++;

          // Check connection health every 100 messages
          if (totalProcessed % 100 === 0) {
            try {
              await this.ensureConnectionHealth();
            } catch (error) {
              logger.error(`Connection health check failed at message ${totalProcessed}:`, error);
              throw error;
            }
          }

          if (!message.envelope) {
            logger.warn(`Skipping message UID ${message.uid} in "${folderPath}" due to missing envelope.`);
            continue;
          }

          const envelope = message.envelope;
          const email: EmailMessage = {
            id: message.uid.toString(),
            subject: envelope.subject || '',
            from: envelope.from?.[0] ? { name: envelope.from[0].name || '', address: envelope.from[0].address || '' } : { address: 'unknown' },
            to: envelope.to?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            cc: envelope.cc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            bcc: envelope.bcc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            date: envelope.date || new Date(),
            folder: folderPath,
            body: '',
          };

          // Update progress less frequently
          if (totalProcessed % progressInterval === 0 || totalProcessed === totalMessages) {
            this.emitProgress({
              processed: totalProcessed,
              total: totalMessages,
              folder: folderPath,
              status: 'syncing'
            });
          }

          yield email;
        }

        logger.debug(`Completed batch ${batchStart}-${batchEnd}: processed ${batchProcessed} messages`);

      } catch (error: any) {
        logger.error(`Error processing batch ${batchStart}-${batchEnd}:`, error);

        // If connection error, throw to trigger retry from current position
        if (error.code === 'NoConnection' || error.message?.includes('Connection not available')) {
          logger.warn(`Connection dropped at message ${totalProcessed}/${totalMessages} in "${folderPath}"`);
          throw error;
        }

        throw error;
      }
    }

    logger.debug(`Batched processing complete: ${totalProcessed} total messages processed`);
  }

  /**
   * Batched message processing (deprecated - use resumable version)
   * Maintained for backwards compatibility
   */
  private async *syncMessagesBatched(folderPath: string, totalMessages: number, since?: Date): AsyncGenerator<EmailMessage> {
    const batchSize = this.batchConfig.batchSize;
    const progressInterval = this.batchConfig.progressUpdateInterval;
    let totalProcessed = 0;
    
    logger.debug(`Starting batched processing: ${totalMessages} messages in batches of ${batchSize}`);
    
    // Calculate message range to fetch
    const startUid = 1;
    const endUid = totalMessages;
    
    // If we have a 'since' date, we still need to fetch all UIDs to respect the date filter
    // The IMAP server will handle the date filtering
    const searchCriteria = since ? { since: since } : `${startUid}:${endUid}`;
    
    // Process messages in batches
    for (let batchStart = startUid; batchStart <= endUid; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endUid);
      const batchCriteria = since ? { since: since, uid: `${batchStart}:${batchEnd}` } : `${batchStart}:${batchEnd}`;
      
      logger.debug(`Processing batch: UIDs ${batchStart}-${batchEnd} (${batchEnd - batchStart + 1} messages)`);
      
      try {
        // Check connection health before each batch
        await this.ensureConnectionHealth();
        
        // Fetch messages for this batch (returns async iterator, not a promise)
        const messages = this.client!.fetch(batchCriteria, { envelope: true, uid: true });
        let batchProcessed = 0;
        
        for await (const message of messages) {
          batchProcessed++;
          totalProcessed++;
          
          // Check connection health every 100 messages to catch issues early
          if (totalProcessed % 100 === 0) {
            try {
              await this.ensureConnectionHealth();
            } catch (error) {
              logger.error(`Connection health check failed at message ${totalProcessed}:`, error);
              throw error; // Let the batch error handler deal with reconnection
            }
          }
          
          if (!message.envelope) {
            logger.warn(`Skipping message UID ${message.uid} in "${folderPath}" due to missing envelope.`);
            continue;
          }
          
          const envelope = message.envelope;
          const email: EmailMessage = {
            id: message.uid.toString(),
            subject: envelope.subject || '',
            from: envelope.from?.[0] ? { name: envelope.from[0].name || '', address: envelope.from[0].address || '' } : { address: 'unknown' },
            to: envelope.to?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            cc: envelope.cc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            bcc: envelope.bcc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
            date: envelope.date || new Date(),
            folder: folderPath,
            body: '', // Not fetching body for performance
          };
          
          // Update progress less frequently for better performance
          if (totalProcessed % progressInterval === 0 || totalProcessed === totalMessages) {
            this.emitProgress({
              processed: totalProcessed,
              total: totalMessages,
              folder: folderPath,
              status: 'syncing'
            });
          }
          
          yield email;
        }
        
        logger.debug(`Completed batch ${batchStart}-${batchEnd}: processed ${batchProcessed} messages`);
        
      } catch (error: any) {
        logger.error(`Error processing batch ${batchStart}-${batchEnd}:`, error);
        
        // Handle different types of errors
        if (error.message?.includes('FETCH_TIMEOUT') || 
            error.message?.includes('Socket timeout') || 
            error.message?.includes('Connection not available') ||
            error.message?.includes('Connection lost')) {
          logger.warn(`🔄 Batch timed out, attempting to recover connection and retry with smaller batch size`);
          
          try {
            // Attempt connection recovery
            if (!this.client?.usable) {
              logger.warn('Connection not usable, attempting to reconnect...');
              // Note: The reconnection logic would need access to auth credentials
              // For now, we'll continue with next batch and let the connection health check handle it
            }
            
            // Retry this batch with smaller size if possible
            const smallerBatchSize = Math.floor(batchSize / 2);
            if (smallerBatchSize >= 50) { // Don't go below 50 messages per batch
              logger.info(`🔄 Retrying batch ${batchStart}-${batchEnd} with smaller size: ${smallerBatchSize}`);
              
              // Process smaller sub-batches within this failed batch
              for (let subStart = batchStart; subStart <= batchEnd; subStart += smallerBatchSize) {
                const subEnd = Math.min(subStart + smallerBatchSize - 1, batchEnd);
                const subCriteria = since ? { since: since, uid: `${subStart}:${subEnd}` } : `${subStart}:${subEnd}`;
                
                try {
                  await this.ensureConnectionHealth();
                  const subMessages = this.client!.fetch(subCriteria, { envelope: true, uid: true });
                  
                  for await (const message of subMessages) {
                    totalProcessed++;
                    
                    if (!message.envelope) {
                      logger.warn(`Skipping message UID ${message.uid} due to missing envelope.`);
                      continue;
                    }
                    
                    const envelope = message.envelope;
                    const email: EmailMessage = {
                      id: message.uid.toString(),
                      subject: envelope.subject || '',
                      from: envelope.from?.[0] ? { name: envelope.from[0].name || '', address: envelope.from[0].address || '' } : { address: 'unknown' },
                      to: envelope.to?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
                      cc: envelope.cc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
                      bcc: envelope.bcc?.map((addr: ImapMessageAddressObject) => ({ name: addr.name || '', address: addr.address || '' })) || [],
                      date: envelope.date || new Date(),
                      folder: folderPath,
                      body: '',
                    };
                    
                    if (totalProcessed % progressInterval === 0) {
                      this.emitProgress({
                        processed: totalProcessed,
                        total: totalMessages,
                        folder: folderPath,
                        status: 'syncing'
                      });
                    }
                    
                    yield email;
                  }
                  
                  logger.debug(`✅ Successfully recovered sub-batch ${subStart}-${subEnd}`);
                  
                } catch (subError) {
                  logger.error(`Failed to recover sub-batch ${subStart}-${subEnd}:`, subError);
                  // Continue with next sub-batch
                  continue;
                }
              }
              
              // Skip to next main batch since we processed this one in sub-batches
              continue;
            }
          } catch (recoveryError) {
            logger.error('Failed to recover from batch timeout:', recoveryError);
          }
        }
        
        // For non-timeout errors or if recovery failed, continue with next batch
        logger.warn(`Skipping failed batch ${batchStart}-${batchEnd} and continuing with next batch`);
        continue;
      }
    }
    
    logger.debug(`Batched processing completed: ${totalProcessed} messages processed`);
  }
  
  async getMessage(messageId: string): Promise<EmailMessage> {
    if (!this.client) {
      throw new Error('Not connected to IMAP server');
    }
    
    const message = await this.client.fetchOne(messageId, {
      envelope: true,
      source: true,
      flags: true,
      labels: true,
      bodyStructure: true,
    });
    
    if (!message) {
      throw new Error('Message not found');
    }
    
    return this.parseMessage(message);
  }
  
  private async parseMessage(message: any): Promise<EmailMessage> {
    const envelope = message.envelope;
    const flags = message.flags || [];
    const labels = message.labels || [];
    
    // Parse addresses
    const parseAddresses = (addrs: any[] = []): EmailAddress[] => {
      return addrs.map(addr => ({
        name: addr.name || '',
        address: `${addr.user}@${addr.host}`,
      }));
    };
    
    // Parse attachments
    const parseAttachments = (): EmailAttachment[] => {
      const attachments: EmailAttachment[] = [];
      
      const processPart = (part: any) => {
        if (part.disposition === 'attachment' || part.disposition === 'inline') {
          attachments.push({
            filename: part.filename || `attachment-${Date.now()}`,
            contentType: part.type,
            size: part.size || 0,
            content: Buffer.from(''), // Will be fetched on demand
            contentId: part.id || undefined,
            contentDisposition: part.disposition,
          });
        }
        
        if (part.childNodes) {
          for (const child of part.childNodes) {
            processPart(child);
          }
        }
      };
      
      if (message.bodyStructure) {
        processPart(message.bodyStructure);
      }
      
      return attachments;
    };
    
    return {
      id: message.uid.toString(),
      threadId: message.threadId?.toString(),
      subject: envelope.subject?.[0] || '(No subject)',
      from: parseAddresses([envelope.from[0]])[0],
      to: parseAddresses(envelope.to || []),
      cc: envelope.cc ? parseAddresses(envelope.cc) : [],
      bcc: envelope.bcc ? parseAddresses(envelope.bcc) : [],
      date: new Date(envelope.date),
      body: '', // Will be parsed from source
      flags,
      labels,
      attachments: parseAttachments(),
      // Additional processing for body would go here
    };
  }
  
  override async disconnect(): Promise<void> {
    if (this.client) {
      try {
        // Only attempt logout if connection is still usable
        if (this.client.usable) {
          logger.debug('Gracefully logging out from IMAP server...');
          await this.client.logout();
        } else {
          logger.debug('Connection not usable, skipping logout');
        }
      } catch (error) {
        // Ignore errors during disconnection - connection might already be dead
        logger.debug('Error during IMAP logout (ignoring):', error);
      } finally {
        this.client = null;
      }
    }
    
    // Reset connection state
    this.connectionRetries = 0;
    this.authCredentials = null;
    
    await super.disconnect();
  }
}
