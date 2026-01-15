const fetch = require('node-fetch');

// Configuration
const API_URL = 'http://localhost:3001/api';
const ACCOUNT_ID = '0463f296-f544-4796-b21d-7ac741b55e76'; // Replace with your test account ID

async function testSyncJob() {
  try {
    console.log('Starting new sync job...');
    
    // Start a new sync job
    const startResponse = await fetch(`${API_URL}/sync/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        folders: ['INBOX'],
        name: 'API Test Sync'
      })
    });

    const startData = await startResponse.json();
    console.log('API Response:', startData);

    if (!startData.success) {
      console.error('Failed to start sync job:', startData.message);
      return;
    }

    const jobId = startData.syncJobId;
    if (!jobId) {
      console.error('No job ID returned from API');
      return;
    }

    console.log(`Sync job started with ID: ${jobId}`);
    console.log('Monitoring job status...');

    // Monitor job status
    let attempts = 0;
    const maxAttempts = 30; // ~1 minute with 2s delay

    while (attempts < maxAttempts) {
      attempts++;
      
      const statusResponse = await fetch(`${API_URL}/sync/jobs/${jobId}`);
      const jobData = await statusResponse.json();
      
      if (jobData.status === 'completed') {
        console.log('\nJob completed successfully!');
        console.log('Job details:', JSON.stringify(jobData, null, 2));
        return;
      } else if (jobData.status === 'failed') {
        console.log('\nJob failed!');
        console.log('Error details:', JSON.stringify(jobData, null, 2));
        return;
      }
      
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\nJob timed out. Final status:');
    const finalStatus = await fetch(`${API_URL}/sync/jobs/${jobId}`);
    console.log(JSON.stringify(await finalStatus.json(), null, 2));
    
  } catch (error) {
    console.error('Error during test:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testSyncJob();
