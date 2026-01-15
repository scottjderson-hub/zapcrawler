#!/usr/bin/env node

/**
 * Test Office365 Cookie Authentication with Outlook Web App APIs
 * These are the internal APIs that OWA uses and accept cookie authentication
 */

const axios = require('axios');

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

// Create HTTP client with cookies and proper OWA headers
function createOwaClient(cookies) {
  const cookieString = cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  return axios.create({
    headers: {
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: function (status) {
      return status < 500;
    }
  });
}

async function testOwaEndpoint(client, name, url, expectedInResponse = []) {
  console.log(`\n🧪 Testing ${name}...`);
  console.log(`   URL: ${url}`);

  try {
    const response = await client.get(url);
    console.log(`   ✅ Response: ${response.status} ${response.statusText}`);
    console.log(`   📄 Content-Type: ${response.headers['content-type'] || 'unknown'}`);

    const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    console.log(`   📏 Content Length: ${responseText.length} chars`);

    // Check for authentication success
    const hasExpectedContent = expectedInResponse.length === 0 ||
      expectedInResponse.some(expected => responseText.toLowerCase().includes(expected.toLowerCase()));

    // Check for OWA-specific success indicators
    const owaSuccessIndicators = [
      'sessiondata',
      'mailfolders',
      'exchangeversion',
      'clientid',
      'timezoneid',
      'canarytoken',
      'userprincipaldisplayname',
      'primarysmtpaddress',
      'exchangeauth',
      'requestid'
    ];

    // Check for auth failure indicators
    const authFailureIndicators = [
      'signin',
      'login',
      'authenticate',
      'unauthorized',
      'access denied',
      'error',
      'exception',
      'aadsts'
    ];

    const textLower = responseText.toLowerCase();
    const hasOwaSuccess = owaSuccessIndicators.some(indicator => textLower.includes(indicator));
    const hasAuthFailure = authFailureIndicators.some(indicator => textLower.includes(indicator));

    const isAuthenticated = response.status === 200 && (hasOwaSuccess || hasExpectedContent) && !hasAuthFailure;

    console.log(`   🔐 Authentication status: ${isAuthenticated ? 'AUTHENTICATED ✅' : 'NOT AUTHENTICATED ❌'}`);

    if (hasOwaSuccess) {
      console.log(`   ✨ OWA success indicators found: ${owaSuccessIndicators.filter(ind => textLower.includes(ind)).join(', ')}`);
    }

    // Show response preview
    if (response.headers['content-type']?.includes('application/json')) {
      try {
        const jsonData = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
        console.log(`   📋 JSON Response:`, JSON.stringify(jsonData, null, 2).substring(0, 1500));

        // Check for folder-like data
        if (jsonData.Body?.ResponseMessages?.Items) {
          console.log(`   📁 Found response items: ${jsonData.Body.ResponseMessages.Items.length}`);
        }
        if (jsonData.Folders || jsonData.folders) {
          const folders = jsonData.Folders || jsonData.folders;
          console.log(`   📁 Found folders: ${folders.length}`);
          folders.slice(0, 5).forEach(folder => {
            console.log(`      - ${folder.DisplayName || folder.displayName}: ${folder.ItemCount || folder.itemCount || '?'} items`);
          });
        }
      } catch (e) {
        console.log(`   📋 Response preview: ${responseText.substring(0, 800)}...`);
      }
    } else {
      // Check for HTML responses that might contain data
      if (responseText.includes('<') && responseText.includes('>')) {
        console.log(`   📋 HTML Response (searching for data)...`);

        // Look for script tags with data
        const scriptMatches = responseText.match(/<script[^>]*>(.*?)<\/script>/gi);
        if (scriptMatches) {
          console.log(`   📜 Found ${scriptMatches.length} script blocks`);
          scriptMatches.slice(0, 3).forEach((script, i) => {
            if (script.length > 100) {
              console.log(`   📜 Script ${i + 1}: ${script.substring(0, 200)}...`);
            }
          });
        }
      } else {
        console.log(`   📋 Response preview: ${responseText.substring(0, 500)}...`);
      }
    }

    return {
      success: response.status === 200,
      authenticated: isAuthenticated,
      status: response.status,
      data: response.data,
      hasOwaIndicators: hasOwaSuccess
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   📄 Error Status: ${error.response.status} ${error.response.statusText}`);
      if (error.response.data) {
        const errorData = typeof error.response.data === 'string'
          ? error.response.data.substring(0, 300)
          : JSON.stringify(error.response.data).substring(0, 300);
        console.log(`   📄 Error Data: ${errorData}...`);
      }
    }
    return { success: false, authenticated: false, error: error.message };
  }
}

async function runOwaTest() {
  console.log('🚀 Office365 Outlook Web App API Test (Cookie Auth)');
  console.log('=' .repeat(60));

  const client = createOwaClient(realCookies);

  // Test OWA-specific endpoints that should work with cookie authentication
  const endpoints = [
    {
      name: "OWA Session Data",
      url: "https://outlook.live.com/owa/sessiondata.ashx",
      expected: ["sessiondata", "userprincipaldisplayname"]
    },
    {
      name: "OWA Service Endpoint",
      url: "https://outlook.live.com/owa/service.svc",
      expected: ["service", "owa"]
    },
    {
      name: "OWA EWS Proxy",
      url: "https://outlook.live.com/EWS/Exchange.asmx",
      expected: ["exchange", "ews"]
    },
    {
      name: "OWA API - Mail Folders",
      url: "https://outlook.live.com/owa/service.svc?action=GetFolder",
      expected: ["folder", "responseclass"]
    },
    {
      name: "Office365 OWA Session",
      url: "https://outlook.office365.com/owa/sessiondata.ashx",
      expected: ["sessiondata"]
    },
    {
      name: "Office365 EWS",
      url: "https://outlook.office365.com/EWS/Exchange.asmx",
      expected: ["exchange", "ews"]
    },
    {
      name: "OWA Main Page",
      url: "https://outlook.live.com/owa/?nlp=1&RpsCsrfState=1",
      expected: ["owa", "sessiondata"]
    }
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testOwaEndpoint(client, endpoint.name, endpoint.url, endpoint.expected);
    results.push({ name: endpoint.name, url: endpoint.url, ...result });
  }

  console.log('\n📊 SUMMARY:');
  console.log('-'.repeat(60));

  const authenticatedEndpoints = results.filter(r => r.authenticated);
  const workingEndpoints = results.filter(r => r.success);
  const owaIndicatorEndpoints = results.filter(r => r.hasOwaIndicators);

  console.log(`✅ AUTHENTICATED ENDPOINTS: ${authenticatedEndpoints.length}`);
  authenticatedEndpoints.forEach(endpoint => {
    console.log(`   ✅ ${endpoint.name}`);
  });

  console.log(`\n📡 SUCCESSFUL RESPONSES: ${workingEndpoints.length}`);
  workingEndpoints.forEach(endpoint => {
    console.log(`   📡 ${endpoint.name} (${endpoint.status})`);
  });

  console.log(`\n✨ ENDPOINTS WITH OWA INDICATORS: ${owaIndicatorEndpoints.length}`);
  owaIndicatorEndpoints.forEach(endpoint => {
    console.log(`   ✨ ${endpoint.name}`);
  });

  if (authenticatedEndpoints.length > 0) {
    console.log('\n🎯 IMPLEMENTATION STRATEGY:');
    console.log('   ✅ Use the authenticated endpoint(s) above');
    console.log('   📡 Parse the response to extract folder/message data');
    console.log('   🔄 Use cookie-based authentication approach');
  } else {
    console.log('\n🤔 TROUBLESHOOTING:');
    console.log('   🔐 Try with a proxy (Microsoft may block some IPs)');
    console.log('   🍪 Check if cookies are still valid/fresh');
    console.log('   🌐 Try accessing from the same region as login');
    console.log('   📱 Use exact browser headers from a working session');
  }
}

runOwaTest().catch(console.error);