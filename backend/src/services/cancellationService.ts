import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * Backend Cancellation Service
 * Manages cancellation of long-running backend operations like auto-detection and account creation
 */
class CancellationService extends EventEmitter {
  private activeOperations = new Map<string, {
    type: 'auto-detect' | 'add-account',
    email: string,
    startTime: Date,
    abortController: AbortController,
    cleanup?: () => void
  }>();

  /**
   * Register a new cancellable operation
   */
  registerOperation(operationId: string, type: 'auto-detect' | 'add-account', email: string, abortController: AbortController, cleanup?: () => void) {
    logger.info(`🔄 Registering cancellable operation: ${operationId} (${type}) for ${email}`);
    
    this.activeOperations.set(operationId, {
      type,
      email,
      startTime: new Date(),
      abortController,
      cleanup
    });

    // Auto-cleanup after 5 minutes to prevent memory leaks
    setTimeout(() => {
      if (this.activeOperations.has(operationId)) {
        logger.warn(`⏰ Auto-cleaning up stale operation: ${operationId}`);
        this.unregisterOperation(operationId);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Cancel a specific operation
   */
  cancelOperation(operationId: string): boolean {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn(`❌ Cannot cancel operation ${operationId}: not found`);
      return false;
    }

    logger.info(`🛑 Cancelling operation: ${operationId} (${operation.type}) for ${operation.email}`);
    
    try {
      // Abort the operation
      operation.abortController.abort();
      
      // Run cleanup if provided
      if (operation.cleanup) {
        operation.cleanup();
      }
      
      // Remove from active operations
      this.activeOperations.delete(operationId);
      
      // Emit cancellation event
      this.emit('operationCancelled', {
        operationId,
        type: operation.type,
        email: operation.email,
        duration: Date.now() - operation.startTime.getTime()
      });
      
      return true;
    } catch (error) {
      logger.error(`❌ Error cancelling operation ${operationId}:`, error);
      return false;
    }
  }

  /**
   * Cancel all operations for a specific bulk import session
   */
  cancelBulkOperations(sessionId: string): number {
    let cancelledCount = 0;
    
    // Find all operations that match the session pattern
    for (const [operationId, operation] of this.activeOperations.entries()) {
      if (operationId.startsWith(sessionId)) {
        if (this.cancelOperation(operationId)) {
          cancelledCount++;
        }
      }
    }
    
    logger.info(`🛑 Cancelled ${cancelledCount} bulk operations for session: ${sessionId}`);
    return cancelledCount;
  }

  /**
   * Unregister an operation (called when operation completes normally)
   */
  unregisterOperation(operationId: string) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      logger.info(`✅ Unregistering completed operation: ${operationId} (${operation.type}) for ${operation.email}`);
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Get all active operations (for debugging)
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.entries()).map(([id, op]) => ({
      id,
      type: op.type,
      email: op.email,
      startTime: op.startTime,
      duration: Date.now() - op.startTime.getTime()
    }));
  }

  /**
   * Force cleanup all operations (emergency cleanup)
   */
  cleanup() {
    logger.warn(`🧹 Force cleaning up ${this.activeOperations.size} active operations`);
    
    for (const [operationId] of this.activeOperations.entries()) {
      this.cancelOperation(operationId);
    }
    
    this.activeOperations.clear();
  }
}

// Singleton instance
export const cancellationService = new CancellationService();

// Graceful shutdown cleanup
process.on('SIGINT', () => {
  cancellationService.cleanup();
});

process.on('SIGTERM', () => {
  cancellationService.cleanup();
});
