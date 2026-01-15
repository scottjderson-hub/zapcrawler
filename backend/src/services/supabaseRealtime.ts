import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase client for real-time operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

interface SyncJobUpdate {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  results_key?: string;
  error_message?: string;
}

interface EmailAccountUpdate {
  id: string;
  status: 'connected' | 'error' | 'syncing';
  last_sync?: string;
  error_message?: string;
}

class SupabaseRealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Supabase real-time service already initialized');
      return;
    }

    try {
      // Test connection using email_jobs table
      const { data, error } = await supabase.from('email_jobs').select('count').limit(1);
      if (error) {
        throw new Error(`Supabase connection test failed: ${error.message}`);
      }

      this.isInitialized = true;
      logger.info('Supabase real-time service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Supabase real-time service:', error);
      throw error;
    }
  }

  /**
   * Broadcast sync job updates to all subscribers
   */
  async broadcastSyncJobUpdate(syncJobUpdate: SyncJobUpdate): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Update the sync job in the database - this will trigger real-time notifications
      const channel = this.channels.get('email_jobs') ||
        supabase.channel('email_jobs', {
          config: {
            presence: {
              key: 'email_jobs'
            }
          }
        });
      const { error } = await supabase
        .from('email_jobs')
        .update({
          status: syncJobUpdate.status,
          progress: syncJobUpdate.progress,
          error_message: syncJobUpdate.error_message,
          results_key: syncJobUpdate.results_key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', syncJobUpdate.id);

      if (error) {
        logger.error('Error updating sync job for real-time broadcast:', error);
        return;
      }

      logger.info(`Broadcasted sync job update for ${syncJobUpdate.id}: ${syncJobUpdate.status}`);
    } catch (error) {
      logger.error('Error broadcasting sync job update:', error);
    }
  }

  /**
   * Broadcast email account updates to all subscribers
   */
  async broadcastEmailAccountUpdate(accountUpdate: EmailAccountUpdate): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Update the email account in the database - this will trigger real-time notifications
      const { error } = await supabase
        .from('email_accounts')
        .update({
          status: accountUpdate.status,
          last_sync: accountUpdate.last_sync,
          error_message: accountUpdate.error_message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountUpdate.id);

      if (error) {
        logger.error('Error updating email account for real-time broadcast:', error);
        return;
      }

      logger.info(`Broadcasted email account update for ${accountUpdate.id}: ${accountUpdate.status}`);
    } catch (error) {
      logger.error('Error broadcasting email account update:', error);
    }
  }

  /**
   * Create a custom real-time channel for application-specific events
   */
  createCustomChannel(channelName: string): RealtimeChannel {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)!;
    }

    const channel = supabase.channel(channelName);
    this.channels.set(channelName, channel);

    logger.info(`Created custom real-time channel: ${channelName}`);
    return channel;
  }

  /**
   * Broadcast custom events (for non-database events like progress updates)
   */
  async broadcastCustomEvent(channelName: string, event: string, payload: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const channel = this.createCustomChannel(channelName);
      
      // Subscribe to the channel if not already subscribed
      if (channel.state !== 'joined') {
        channel.subscribe();
      }

      // Send the custom event
      const response = await channel.send({
        type: 'broadcast',
        event: event,
        payload: payload,
      });

      if (response === 'ok') {
        logger.info(`Broadcasted custom event '${event}' on channel '${channelName}'`);
      } else {
        logger.warn(`Failed to broadcast custom event '${event}' on channel '${channelName}': ${response}`);
      }
    } catch (error) {
      logger.error(`Error broadcasting custom event '${event}' on channel '${channelName}':`, error);
    }
  }

  /**
   * Broadcast sync progress updates with user-specific channels
   */
  async broadcastSyncProgress(syncJobId: string, progress: number, userId: string, message?: string): Promise<void> {
    const channelName = `sync-progress-${userId}`;
    await this.broadcastCustomEvent(channelName, 'progress-update', {
      syncJobId,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast user-specific notifications
   */
  async broadcastNotification(type: 'info' | 'success' | 'warning' | 'error', message: string, userId: string, data?: any): Promise<void> {
    const channelName = `notifications-${userId}`;
    await this.broadcastCustomEvent(channelName, 'notification', {
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast token balance updates to user
   */
  async broadcastTokenBalanceUpdate(userId: string, newBalance: number, tokensDeducted: number, action: string): Promise<void> {
    const channelName = `token-balance-${userId}`;
    await this.broadcastCustomEvent(channelName, 'balance-update', {
      newBalance,
      tokensDeducted,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      // Unsubscribe from all channels
      for (const [channelName, channel] of this.channels) {
        await channel.unsubscribe();
        logger.info(`Unsubscribed from channel: ${channelName}`);
      }

      this.channels.clear();
      this.isInitialized = false;
      logger.info('Supabase real-time service cleaned up');
    } catch (error) {
      logger.error('Error during Supabase real-time service cleanup:', error);
    }
  }
}

// Export singleton instance
export const supabaseRealtime = new SupabaseRealtimeService();

// Convenience functions for backward compatibility with WebSocket API
export const broadcast = async (event: string, data: any) => {
  await supabaseRealtime.broadcastCustomEvent('general', event, data);
};

export const sendToClient = async (clientId: string, event: string, data: any) => {
  // Use user-specific channels for targeted messaging
  const channelName = `client-${clientId}`;
  await supabaseRealtime.broadcastCustomEvent(channelName, event, data);
};

// Initialize the service when the module is loaded
supabaseRealtime.initialize().catch((error) => {
  logger.error('Failed to initialize Supabase real-time service on module load:', error);
});
