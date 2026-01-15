const { createClient } = require('@supabase/supabase-js');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

async function checkWorker() {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase URL or service role key in environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('Checking worker and queue status...');

    // Get all running jobs
    const { data: runningJobs, error: jobsError } = await supabase
      .from('email_jobs')
      .select('*')
      .eq('status', 'running');

    if (jobsError) throw jobsError;

    console.log(`\nFound ${runningJobs.length} jobs in 'running' state:`);
    runningJobs.forEach(job => {
      console.log(`- Job ID: ${job.id}, Account: ${job.account_id}, Created: ${job.created_at}`);
    });

    // Check if worker process is running
    try {
      const redis = new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null
      });

      // Check if Redis is connected
      await redis.ping();
      console.log('\nRedis connection successful');

      // Check if worker is registered
      const workers = await redis.keys('bull:email-queue:workers:*');
      console.log(`\nFound ${workers.length} workers registered:`);
      workers.forEach(worker => console.log(`- ${worker}`));

      // Check queue status
      const queue = new Queue('email-queue', { connection: redis });
      const jobCounts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      console.log('\nQueue status:', jobCounts);

      // Get active jobs
      const activeJobs = await queue.getActive();
      console.log(`\nActive jobs (${activeJobs.length}):`);
      activeJobs.forEach(job => {
        console.log(`- Job ${job.id} (${job.name}): ${JSON.stringify(job.data)}`);
      });

      // Get failed jobs
      const failedJobs = await queue.getFailed();
      console.log(`\nFailed jobs (${failedJobs.length}):`);
      failedJobs.forEach(job => {
        console.log(`- Job ${job.id} (${job.name}): ${job.failedReason}`);
      });

      await queue.close();
      await redis.quit();
    } catch (redisError) {
      console.error('\nError connecting to Redis:', redisError.message);
      console.log('Make sure Redis is running and check your REDIS_HOST/REDIS_PORT environment variables');
    }

  } catch (error) {
    console.error('Error checking worker status:', error);
  }
}

checkWorker();
