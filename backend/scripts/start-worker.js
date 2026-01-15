const { Worker } = require('bullmq');
const { connection } = require('../dist/services/queueService');
const { logger } = require('../dist/utils/logger');
const { processJob } = require('../dist/workers/emailWorker');

require('dotenv').config();

async function startWorker() {
  try {
    logger.info('Starting email worker...');
    
    const worker = new Worker('email-account-queue', processJob, {
      connection: connection,
      concurrency: 5,
      lockDuration: 30000,
    });

    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} has completed`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} has failed: ${err.message}`);
    });

    worker.on('error', (err) => {
      logger.error('Worker error:', err);
    });

    logger.info('Email worker started and listening for jobs...');
    
    // Keep the process alive
    setInterval(() => {
      // Keep the process alive
    }, 1000 * 60 * 60);
    
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();
