import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksClient } from 'socks';
import * as https from 'https';
import { IProxy } from '../models/Proxy';

// A reliable, non-regionalized endpoint for testing connectivity.
const TEST_URL = 'https://httpbin.org/get';
const TEST_TIMEOUT = 10000; // 10 seconds

export const testProxyConnection = async (proxy: any): Promise<void> => {
  // Use proxy authentication username (not the database user_id)
  const username = proxy.username || proxy.userId;
  
  console.log(`Testing proxy connection: ${proxy.type} ${proxy.host}:${proxy.port}`);
  console.log(`Proxy object:`, JSON.stringify(proxy, null, 2));
  console.log(`Username resolved as: ${username}`);
  
  // Build proxy URL with proper format for each type
  let proxyUrl;
  let agent;
  
  if (proxy.type === 'SOCKS5') {
    // Validate required fields
    if (!username || !proxy.password || !proxy.host || !proxy.port) {
      throw new Error(`Missing required SOCKS5 proxy fields: username=${username}, password=${proxy.password ? '[SET]' : '[MISSING]'}, host=${proxy.host}, port=${proxy.port}`);
    }
    
    console.log(`Testing SOCKS5 proxy: ${proxy.host}:${proxy.port} with user: ${username}`);
    
    // Use SocksClient directly like the IMAP service does
    const proxyConfig = {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: 5 as const,
        userId: username,
        password: proxy.password
      },
      timeout: TEST_TIMEOUT,
      command: 'connect' as const,
      destination: {
        host: 'httpbin.org',
        port: 443,
      }
    };
    
    try {
      console.log('Creating SOCKS connection to httpbin.org:443...');
      const info = await SocksClient.createConnection(proxyConfig);
      console.log('SOCKS connection established successfully');
      info.socket.destroy();
      return; // Success - no need to continue with HTTP test
    } catch (error: any) {
      throw new Error(`SOCKS5 connection failed: ${error.message}`);
    }
  } else if (proxy.type === 'HTTP') {
    // HTTP/HTTPS uses http:// protocol
    proxyUrl = `http://${username && proxy.password ? `${username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
    agent = new HttpsProxyAgent(proxyUrl);
  } else {
    throw new Error(`Unsupported proxy type: ${proxy.type}`);
  }

  try {
    console.log(`Making test request to ${TEST_URL} via proxy...`);
    const response = await fetch(TEST_URL, { 
      agent, 
      timeout: TEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mail-Discovery-Central/1.0'
      }
    });
    
    console.log(`Proxy test response status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`Connection test failed with status: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.text();
    console.log(`Proxy test successful, response length: ${responseData.length}`);
    
  } catch (error: any) {
    console.error(`Proxy test failed:`, error.message);
    throw new Error(`Proxy connection failed: ${error.message}`);
  }
};
