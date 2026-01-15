#!/usr/bin/env node

/**
 * Standalone Office365 Cookie Authentication Test Script
 *
 * This script tests various approaches to authenticate with Office365/Outlook
 * using browser cookies to find the correct endpoint and method.
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Test configuration
const TEST_CONFIG = {
  // Test with invalid cookies first
  invalidCookies: [
    {
      name: "ESTSAUTH",
      value: "invalid_token_12345",
      domain: "login.microsoftonline.com",
      path: "/",
      httpOnly: true
    },
    {
      name: "ESTSAUTHPERSISTENT",
      value: "invalid_persistent_67890",
      domain: "login.microsoftonline.com",
      path: "/",
      httpOnly: true
    }
  ],

  // Real cookies from session.txt
  realCookies: [
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
  ],

  // SOCKS5 Proxy configuration
  proxy: {
    host: "216.10.27.159",
    port: 6593,
    type: "SOCKS5",
    auth: {
      username: "lfafuacv",
      password: "oixy0zsh3ust"
    }
  },

  // Test endpoints to try
  endpoints: [
    {
      name: "Outlook Web App (OWA)",
      url: "https://outlook.live.com/owa/?nlp=1",
      method: "GET",
      expectedContent: ["owa", "outlook", "microsoft"]
    },
    {
      name: "Graph API - Me",
      url: "https://graph.microsoft.com/v1.0/me",
      method: "GET",
      expectedContent: ["@odata", "userPrincipalName", "displayName"]
    },
    {
      name: "Graph API - Mail Folders",
      url: "https://graph.microsoft.com/v1.0/me/mailFolders",
      method: "GET",
      expectedContent: ["@odata", "value", "displayName"]
    },
    {
      name: "Outlook REST API - Folders",
      url: "https://outlook.office.com/api/v2.0/me/mailfolders",
      method: "GET",
      expectedContent: ["@odata", "value", "DisplayName"]
    },
    {
      name: "Office.com Portal",
      url: "https://www.office.com/",
      method: "GET",
      expectedContent: ["office", "microsoft", "user"]
    },
    {
      name: "Outlook.office365.com",
      url: "https://outlook.office365.com/owa/",
      method: "GET",
      expectedContent: ["owa", "outlook", "office365"]
    }
  ]
};

/**
 * Create HTTP client with cookies
 */
function createHttpClient(cookies, proxy = null) {
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
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: function (status) {
      return status < 500; // Accept anything under 500
    }
  };

  // Add proxy if provided
  if (proxy) {
    console.log(`🔐 Using proxy: ${proxy.host}:${proxy.port} (${proxy.type})`);
    if (proxy.type === 'SOCKS5') {
      const proxyUrl = proxy.auth
        ? `socks5://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`
        : `socks5://${proxy.host}:${proxy.port}`;
      config.httpsAgent = new SocksProxyAgent(proxyUrl);
      config.httpAgent = new SocksProxyAgent(proxyUrl);
    } else if (proxy.type === 'HTTP') {
      const proxyUrl = proxy.auth
        ? `http://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`
        : `http://${proxy.host}:${proxy.port}`;
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.httpAgent = new HttpsProxyAgent(proxyUrl);
    }
  }

  return axios.create(config);
}

/**
 * Test a specific endpoint with given cookies
 */
async function testEndpoint(client, endpoint, cookieType) {
  console.log(`\n🧪 Testing ${endpoint.name} with ${cookieType} cookies...`);
  console.log(`   URL: ${endpoint.url}`);

  try {
    const response = await client.request({
      method: endpoint.method,
      url: endpoint.url
    });

    console.log(`   ✅ Response: ${response.status} ${response.statusText}`);
    console.log(`   📄 Content-Type: ${response.headers['content-type'] || 'unknown'}`);
    console.log(`   📏 Content Length: ${response.data?.length || 0} chars`);

    // Check if response contains expected content
    const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const hasExpectedContent = endpoint.expectedContent.some(content =>
      responseText.toLowerCase().includes(content.toLowerCase())
    );

    console.log(`   🔍 Has expected content: ${hasExpectedContent}`);

    // Show relevant response data (truncated)
    if (response.status === 200 && responseText.length > 0) {
      if (response.headers['content-type']?.includes('application/json')) {
        try {
          const jsonData = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
          console.log(`   📋 JSON Response (truncated):`, JSON.stringify(jsonData, null, 2).substring(0, 500) + '...');
        } catch (e) {
          console.log(`   📋 Response preview: ${responseText.substring(0, 200)}...`);
        }
      } else {
        console.log(`   📋 Response preview: ${responseText.substring(0, 200)}...`);
      }
    }

    // Check for authentication indicators
    const isAuthenticated = checkAuthentication(response, responseText);
    console.log(`   🔐 Authentication status: ${isAuthenticated ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);

    return {
      success: response.status === 200,
      authenticated: isAuthenticated,
      hasContent: hasExpectedContent,
      status: response.status,
      contentType: response.headers['content-type'],
      dataLength: responseText.length,
      response: response.data
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   📄 Error Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`   📄 Error Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
    }

    return {
      success: false,
      authenticated: false,
      hasContent: false,
      status: error.response?.status || 0,
      error: error.message
    };
  }
}

/**
 * Check if response indicates successful authentication
 */
function checkAuthentication(response, responseText) {
  // Check for common authentication failure indicators
  const authFailureIndicators = [
    'sign in',
    'login',
    'authenticate',
    'unauthorized',
    'access denied',
    'session expired',
    'redirect to login',
    'authentication required'
  ];

  // Check for success indicators
  const authSuccessIndicators = [
    'userPrincipalName',
    'displayName',
    '@odata',
    'mailfolders',
    'owa-',
    'office365',
    'user@',
    '"value":'
  ];

  const textLower = responseText.toLowerCase();

  const hasFailureIndicator = authFailureIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  const hasSuccessIndicator = authSuccessIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  // If we got a 200 response with success indicators and no failure indicators
  return response.status === 200 && hasSuccessIndicator && !hasFailureIndicator;
}

/**
 * Validate cookie format
 */
function validateCookies(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { valid: false, error: 'Cookies must be a non-empty array' };
  }

  const requiredCookies = ['ESTSAUTH', 'ESTSAUTHPERSISTENT'];
  const cookieNames = cookies.map(c => c.name);

  for (const required of requiredCookies) {
    if (!cookieNames.includes(required)) {
      return { valid: false, error: `Missing required cookie: ${required}` };
    }
  }

  for (const cookie of cookies) {
    if (!cookie.name || !cookie.value || !cookie.domain) {
      return { valid: false, error: 'Invalid cookie structure - missing name, value, or domain' };
    }
  }

  return { valid: true };
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Office365 Cookie Authentication Test Script');
  console.log('=' .repeat(60));

  // Test 1: Invalid cookies (should fail)
  console.log('\n📋 TEST 1: Invalid Cookies (should fail authentication)');
  console.log('-'.repeat(50));

  const invalidValidation = validateCookies(TEST_CONFIG.invalidCookies);
  console.log(`🔍 Cookie validation: ${invalidValidation.valid ? 'VALID' : 'INVALID'} - ${invalidValidation.error || 'OK'}`);

  const invalidClient = createHttpClient(TEST_CONFIG.invalidCookies);
  const invalidResults = [];

  for (const endpoint of TEST_CONFIG.endpoints) {
    const result = await testEndpoint(invalidClient, endpoint, 'INVALID');
    invalidResults.push({ endpoint: endpoint.name, ...result });
  }

  // Test 2: Real cookies (user needs to provide)
  console.log('\n📋 TEST 2: Real Cookies (user must provide actual cookies)');
  console.log('-'.repeat(50));

  const realValidation = validateCookies(TEST_CONFIG.realCookies);
  console.log(`🔍 Cookie validation: ${realValidation.valid ? 'VALID' : 'INVALID'} - ${realValidation.error || 'OK'}`);

  // Check if user provided real cookies
  const hasRealCookies = TEST_CONFIG.realCookies.some(cookie =>
    !cookie.value.includes('PASTE_REAL') && cookie.value.length > 20
  );

  if (!hasRealCookies) {
    console.log('⚠️  No real cookies provided. Please edit the script and add your actual browser cookies.');
    console.log('📝 To get cookies:');
    console.log('   1. Login to outlook.live.com in your browser');
    console.log('   2. Open Developer Tools (F12)');
    console.log('   3. Go to Application/Storage → Cookies → login.microsoftonline.com');
    console.log('   4. Copy ESTSAUTH and ESTSAUTHPERSISTENT values');
    console.log('   5. Replace the PASTE_REAL_* values in this script');
  } else {
    const realClient = createHttpClient(TEST_CONFIG.realCookies, TEST_CONFIG.proxy);
    const realResults = [];

    for (const endpoint of TEST_CONFIG.endpoints) {
      const result = await testEndpoint(realClient, endpoint, 'REAL');
      realResults.push({ endpoint: endpoint.name, ...result });
    }

    // Analysis of real cookie results
    console.log('\n📊 REAL COOKIE TEST RESULTS:');
    console.log('-'.repeat(50));
    realResults.forEach(result => {
      const status = result.authenticated ? '✅ AUTHENTICATED' :
                    result.success ? '⚠️  SUCCESS BUT NOT AUTHENTICATED' :
                    '❌ FAILED';
      console.log(`${status} - ${result.endpoint} (${result.status})`);
    });

    // Find best working endpoint
    const workingEndpoints = realResults.filter(r => r.authenticated);
    if (workingEndpoints.length > 0) {
      console.log(`\n🎯 WORKING ENDPOINTS FOUND: ${workingEndpoints.length}`);
      workingEndpoints.forEach(endpoint => {
        console.log(`   ✅ ${endpoint.endpoint}`);
      });
    }
  }

  // Summary
  console.log('\n📈 ANALYSIS SUMMARY:');
  console.log('-'.repeat(50));
  console.log('🔍 Invalid cookies should fail on all endpoints (validates our detection)');
  console.log('🔍 Real cookies should authenticate on Outlook/Graph API endpoints');
  console.log('🔍 Look for endpoints returning JSON with user data or folder information');
  console.log('\n📝 NEXT STEPS:');
  console.log('   1. Provide real cookies in the script');
  console.log('   2. Run the test again');
  console.log('   3. Identify which endpoints work with your cookies');
  console.log('   4. Use the working endpoint approach in the main application');

  // Test cookie extraction from browser format
  console.log('\n🍪 COOKIE FORMAT TEST:');
  console.log('-'.repeat(50));
  testCookieFormats();
}

/**
 * Test different cookie input formats
 */
function testCookieFormats() {
  console.log('Testing cookie parsing from different browser export formats...');

  // Test browser extension export format
  const browserExtensionFormat = `[
    {"name":"ESTSAUTH","value":"example_token","domain":".login.microsoftonline.com","path":"/","expirationDate":1672531200,"httpOnly":true,"secure":true},
    {"name":"ESTSAUTHPERSISTENT","value":"example_persistent","domain":".login.microsoftonline.com","path":"/","expirationDate":1672531200,"httpOnly":true,"secure":true}
  ]`;

  try {
    const parsed = JSON.parse(browserExtensionFormat);
    console.log('✅ Browser extension format parsed successfully');
    console.log(`   Found ${parsed.length} cookies`);
    parsed.forEach(cookie => {
      console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
    });
  } catch (e) {
    console.log('❌ Failed to parse browser extension format:', e.message);
  }

  // Test manual copy-paste format
  const manualFormat = `ESTSAUTH=example_token_here; ESTSAUTHPERSISTENT=example_persistent_token; path=/; domain=.login.microsoftonline.com`;
  console.log('✅ Manual cookie string format example provided');
  console.log(`   Format: ${manualFormat.substring(0, 50)}...`);
}

// Run the tests
runTests().catch(console.error);