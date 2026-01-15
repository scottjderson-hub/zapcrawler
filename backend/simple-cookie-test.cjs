#!/usr/bin/env node

/**
 * Simple Office365 Cookie Test - No Proxy First
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

// Create HTTP client with cookies (no proxy)
function createHttpClient(cookies) {
  const cookieString = cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  return axios.create({
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
  });
}

async function testEndpoint(client, name, url) {
  console.log(`\n🧪 Testing ${name}...`);
  console.log(`   URL: ${url}`);

  try {
    const response = await client.get(url);
    console.log(`   ✅ Response: ${response.status} ${response.statusText}`);
    console.log(`   📄 Content-Type: ${response.headers['content-type'] || 'unknown'}`);
    console.log(`   📏 Content Length: ${response.data?.length || 0} chars`);

    const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    // Check for authentication success indicators
    const authSuccessIndicators = [
      'userPrincipalName',
      'displayName',
      '@odata',
      'mailfolders',
      'owa-',
      'office365',
      'user@',
      '"value":',
      'parentFolderId',
      'totalItemCount',
      'unreadItemCount'
    ];

    // Check for authentication failure indicators
    const authFailureIndicators = [
      'sign in',
      'login',
      'authenticate',
      'unauthorized',
      'access denied',
      'session expired',
      'redirect to login',
      'authentication required',
      'AADSTS',
      'error_description'
    ];

    const textLower = responseText.toLowerCase();
    const hasSuccessIndicator = authSuccessIndicators.some(indicator =>
      textLower.includes(indicator.toLowerCase())
    );
    const hasFailureIndicator = authFailureIndicators.some(indicator =>
      textLower.includes(indicator.toLowerCase())
    );

    const isAuthenticated = response.status === 200 && hasSuccessIndicator && !hasFailureIndicator;
    console.log(`   🔐 Authentication status: ${isAuthenticated ? 'AUTHENTICATED ✅' : 'NOT AUTHENTICATED ❌'}`);

    // Show relevant response data
    if (response.headers['content-type']?.includes('application/json')) {
      try {
        const jsonData = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
        console.log(`   📋 JSON Response (first 1000 chars):`, JSON.stringify(jsonData, null, 2).substring(0, 1000));

        // If it's mail folders, show the folder structure
        if (jsonData.value && Array.isArray(jsonData.value)) {
          console.log(`   📁 Found ${jsonData.value.length} folders:`);
          jsonData.value.slice(0, 5).forEach(folder => {
            console.log(`      - ${folder.displayName || folder.DisplayName}: ${folder.totalItemCount || folder.TotalItemCount || 0} items`);
          });
        }
      } catch (e) {
        console.log(`   📋 Response preview: ${responseText.substring(0, 500)}...`);
      }
    } else {
      console.log(`   📋 Response preview: ${responseText.substring(0, 300)}...`);
    }

    return {
      success: response.status === 200,
      authenticated: isAuthenticated,
      status: response.status,
      data: response.data
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   📄 Error Status: ${error.response.status} ${error.response.statusText}`);
      if (error.response.data) {
        console.log(`   📄 Error Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    return { success: false, authenticated: false, error: error.message };
  }
}

async function runSimpleTest() {
  console.log('🚀 Simple Office365 Cookie Test (No Proxy)');
  console.log('=' .repeat(60));

  const client = createHttpClient(realCookies);

  // Test the most promising endpoints
  const endpoints = [
    {
      name: "Graph API - Me",
      url: "https://graph.microsoft.com/v1.0/me"
    },
    {
      name: "Graph API - Mail Folders",
      url: "https://graph.microsoft.com/v1.0/me/mailFolders"
    },
    {
      name: "Graph API - Messages",
      url: "https://graph.microsoft.com/v1.0/me/messages?$top=5"
    },
    {
      name: "Outlook REST API - Folders",
      url: "https://outlook.office.com/api/v2.0/me/mailfolders"
    },
    {
      name: "Outlook Web App (OWA)",
      url: "https://outlook.live.com/owa/?nlp=1"
    },
    {
      name: "Outlook Office365 OWA",
      url: "https://outlook.office365.com/owa/"
    }
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(client, endpoint.name, endpoint.url);
    results.push({ name: endpoint.name, ...result });
  }

  console.log('\n📊 SUMMARY:');
  console.log('-'.repeat(50));
  const workingEndpoints = results.filter(r => r.authenticated);

  if (workingEndpoints.length > 0) {
    console.log(`✅ AUTHENTICATED ENDPOINTS (${workingEndpoints.length}):`);
    workingEndpoints.forEach(endpoint => {
      console.log(`   ✅ ${endpoint.name}`);
    });
  } else {
    console.log('❌ No authenticated endpoints found');
    console.log('📝 This could mean:');
    console.log('   - Cookies are expired');
    console.log('   - Need different authentication approach');
    console.log('   - Need proxy for this location');
    console.log('   - Different headers/user-agent required');
  }

  const successfulEndpoints = results.filter(r => r.success);
  if (successfulEndpoints.length > 0) {
    console.log(`\n📡 SUCCESSFUL RESPONSES (${successfulEndpoints.length}):`);
    successfulEndpoints.forEach(endpoint => {
      console.log(`   📡 ${endpoint.name} (${endpoint.status})`);
    });
  }
}

runSimpleTest().catch(console.error);