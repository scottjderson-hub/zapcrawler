const { emailQueue } = require('../dist/services/queueService');
const { logger } = require('../dist/utils/logger');

require('dotenv').config();

async function testQueue() {
  try {
    logger.info('Testing queue functionality...');
    
    // Add a test job
    const job = await emailQueue.add('test-job', {
      message: 'This is a test job',
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Added test job with ID: ${job.id}`);
    
    // Check queue status
    const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
    logger.info('Queue status:', counts);
    
    // Wait a bit to see if the job gets processed
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check job status
    const jobStatus = await job.getState();
    logger.info(`Job ${job.id} status: ${jobStatus}`);
    
    if (jobStatus === 'failed') {
      const error = await job.getFailedReason();
      logger.error('Job failed:', error);
    }
    
  } catch (error) {
    logger.error('Queue test failed:', error);
  } finally {
    // Clean up
    await emailQueue.close();
    process.exit(0);
  }
}

testQueue();
