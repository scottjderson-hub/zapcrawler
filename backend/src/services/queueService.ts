// User-scoped queue system to support multi-user concurrent operations
import { EventEmitter } from 'events';

interface Job {
  id: string;
  name: string;
  data: any;
  timestamp: Date;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  result?: any;
  error?: any;
  userId: string; // Add user context to jobs
  remove: () => Promise<void>;
}

class SimpleQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  public pendingJobs: Job[] = [];
  private jobIdCounter = 1;
  private workers: SimpleWorker[] = [];

  constructor(public name: string, options?: any) {
    super();
  }

  setDefaultProcessor(processor: (job: Job) => Promise<any>) {
    this.defaultProcessor = processor;
  }

  async add(jobName: string, data: any, options?: { userId?: string }): Promise<Job> {
    const userId = options?.userId || 'anonymous';
    const job: Job = {
      id: String(this.jobIdCounter++),
      name: jobName,
      data,
      timestamp: new Date(),
      status: 'waiting',
      userId,
      remove: async () => {
        this.removeJob(job.id);
      }
    };

    this.jobs.set(job.id, job);
    this.pendingJobs.push(job);
    
    console.log(`[QUEUE] Job ${job.id} added to queue: ${jobName} for user: ${userId}`);
    
    // Process jobs immediately
    setImmediate(() => this.processNextJob());
    
    return job;
  }

  public async processNextJob() {
    if (this.pendingJobs.length === 0) return;
    
    const job = this.pendingJobs.shift();
    if (!job) return;

    console.log(`[QUEUE] Processing job ${job.id}: ${job.name} for user: ${job.userId}`);
    job.status = 'active';
    
    // Find available worker or create new one for concurrent processing
    let availableWorker = this.workers.find(w => !w.isProcessing);
    
    if (!availableWorker && this.workers.length < this.maxConcurrentWorkers && this.defaultProcessor) {
      // Create new worker if we haven't hit the limit
      availableWorker = new SimpleWorker(this.name, this.defaultProcessor);
      this.registerWorker(availableWorker);
    }
    
    if (availableWorker) {
      availableWorker.processJob(job);
    } else {
      // Put job back and try later
      this.pendingJobs.unshift(job);
      job.status = 'waiting';
      setTimeout(() => this.processNextJob(), 1000); // Retry in 1 second
    }
  }

  private maxConcurrentWorkers = 5; // Allow up to 5 concurrent jobs
  private defaultProcessor: ((job: Job) => Promise<any>) | null = null;

  registerWorker(worker: SimpleWorker) {
    this.workers.push(worker);
    console.log(`[QUEUE] Worker registered for queue: ${this.name}`);
  }

  completeJob(jobId: string, result?: any) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.result = result;
      console.log(`[QUEUE] Job ${jobId} completed`);
      this.emit('completed', job, result);
    }
  }

  failJob(jobId: string, error: any) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      console.log(`[QUEUE] Job ${jobId} failed:`, error.message || error);
      this.emit('failed', job, error);
    }
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  removeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      // Remove from jobs map
      this.jobs.delete(jobId);
      
      // Remove from pending jobs if it's still waiting
      const pendingIndex = this.pendingJobs.findIndex(j => j.id === jobId);
      if (pendingIndex !== -1) {
        this.pendingJobs.splice(pendingIndex, 1);
      }
      
      console.log(`[QUEUE] Job ${jobId} removed from queue`);
      return true;
    }
    return false;
  }
}

class SimpleWorker extends EventEmitter {
  public isProcessing = false;

  constructor(
    private queueName: string,
    private processor: (job: Job) => Promise<any>,
    private options?: any
  ) {
    super();
    console.log(`[WORKER] Worker created for queue: ${queueName}`);
  }

  async processJob(job: Job) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log(`[WORKER] Starting to process job ${job.id}`);
    this.emit('active', job);

    try {
      const result = await this.processor(job);
      emailQueue.completeJob(job.id, result);
      this.emit('completed', job, result);
    } catch (error) {
      console.error(`[WORKER] Job ${job.id} failed:`, error);
      emailQueue.failJob(job.id, error);
      this.emit('failed', job, error);
    } finally {
      this.isProcessing = false;
      
      // Process next job if any
      setImmediate(() => {
        if (emailQueue.pendingJobs.length > 0) {
          emailQueue.processNextJob();
        }
      });
    }
  }

  on(event: string, callback: Function) {
    super.on(event, callback as any);
    
    // For compatibility, emit ready event immediately
    if (event === 'ready') {
      setImmediate(() => callback());
    }
    
    return this;
  }
}

// Queue Manager for user-scoped queues
class QueueManager {
  private userQueues = new Map<string, SimpleQueue>();
  private globalProcessor: ((job: Job) => Promise<any>) | null = null;

  setGlobalProcessor(processor: (job: Job) => Promise<any>) {
    this.globalProcessor = processor;
  }

  getQueueForUser(userId: string): SimpleQueue {
    if (!this.userQueues.has(userId)) {
      const queue = new SimpleQueue(`email-queue-${userId}`);
      if (this.globalProcessor) {
        queue.setDefaultProcessor(this.globalProcessor);
      }
      this.userQueues.set(userId, queue);
      console.log(`[QUEUE MANAGER] Created new queue for user: ${userId}`);
    }
    return this.userQueues.get(userId)!;
  }

  // Get all active users for monitoring
  getActiveUsers(): string[] {
    return Array.from(this.userQueues.keys());
  }

  // Clean up inactive queues periodically
  cleanupInactiveQueues() {
    for (const [userId, queue] of this.userQueues) {
      if (queue.pendingJobs.length === 0) {
        // Check if queue has been idle for more than 30 minutes
        const lastActivity = Math.max(
          ...Array.from(queue['jobs'].values()).map(job => job.timestamp.getTime()),
          0
        );
        
        if (Date.now() - lastActivity > 30 * 60 * 1000) {
          this.userQueues.delete(userId);
          console.log(`[QUEUE MANAGER] Cleaned up inactive queue for user: ${userId}`);
        }
      }
    }
  }
}

// Create global queue manager instance
export const queueManager = new QueueManager();

// Backward compatibility - create a default queue
export const emailQueue = queueManager.getQueueForUser('default');

// Export Worker class for compatibility
export class Worker extends SimpleWorker {
  constructor(queueName: string, processor: (job: Job) => Promise<any>, options?: any) {
    super(queueName, processor, options);
    
    // Set the global processor and register with default queue
    queueManager.setGlobalProcessor(processor);
    emailQueue.registerWorker(this);
    
    console.log(`[WORKER] Worker registered with global processor`);
  }
}

// For compatibility with existing code
export const connection = null;

// Cleanup inactive queues every 15 minutes
setInterval(() => {
  queueManager.cleanupInactiveQueues();
}, 15 * 60 * 1000);
