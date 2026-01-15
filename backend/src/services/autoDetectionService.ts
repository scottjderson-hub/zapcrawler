import { DetectedSettings, autoDetectSettings, providerPresets } from '../lib/provider-presets';
import { ImapHandler } from './protocols/imap';
import { Pop3Handler } from './protocols/pop3';
import { ExchangeHandler } from './protocols/exchange';
import { ServerListParser } from './serverListParser';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as dns from 'dns';

const execAsync = promisify(exec);
const resolveMxAsync = promisify(dns.resolveMx);

export interface AutoDetectionResult {
  success: boolean;
  settings?: DetectedSettings;
  data?: {
    email: string;
    provider: { type: string; name?: string; host: string; port: number; secure: boolean };
    auth: { user: string; pass: string };
  };
  error?: string;
  testedConfigurations: number;
}

export interface TestConnectionOptions {
  email: string;
  password: string;
  timeout?: number;
  maxAttempts?: number;
  proxy?: {
    host: string;
    port: number;
    type: 'SOCKS5' | 'HTTP';
    userId?: string;
    password?: string;
  };
  abortSignal?: AbortSignal;
}

/**
 * Get MX records for a domain using Node.js DNS (fallback from dig command)
 */
async function getMXRecords(domain: string): Promise<string[]> {
  try {
    // Try Node.js DNS first (more reliable and doesn't require dig command)
    const mxRecords = await resolveMxAsync(domain);
    const hostnames = mxRecords
      .sort((a, b) => a.priority - b.priority) // Sort by priority
      .map(record => record.exchange.replace(/\.$/, '')) // Remove trailing dot
      .filter(hostname => hostname && hostname !== domain); // Filter out empty and self-references
    
    console.log(`📧 MX records for ${domain}:`, hostnames);
    return hostnames;
  } catch (dnsError) {
    console.log(`❌ DNS MX lookup failed for ${domain}, trying dig command fallback:`, (dnsError as Error).message);
    
    // Fallback to dig command if available
    try {
      const { stdout } = await execAsync(`dig MX ${domain} +short`);
      const mxRecords = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          // Extract hostname from "priority hostname" format
          const parts = line.trim().split(' ');
          return parts[parts.length - 1].replace(/\.$/, ''); // Remove trailing dot
        })
        .filter(hostname => hostname && hostname !== domain); // Filter out empty and self-references
      
      console.log(`📧 MX records for ${domain} (via dig):`, mxRecords);
      return mxRecords;
    } catch (digError) {
      console.log(`❌ Both DNS and dig failed for ${domain}:`, (digError as Error).message);
      return [];
    }
  }
}

/**
 * Map MX hostname to Exchange/EWS endpoints using intelligent patterns
 */
function mapMXToExchange(mxHostname: string, domain: string): string[] {
  const candidates: string[] = [];
  
  // Common Exchange/EWS server patterns based on MX hostname
  if (mxHostname.includes('outlook') || mxHostname.includes('office365') || mxHostname.includes('microsoft')) {
    candidates.push('outlook.office365.com');
  } else if (mxHostname.includes('exchange')) {
    candidates.push(mxHostname.replace('mx', 'exchange').replace('mail', 'exchange'));
  } else {
    // PRIORITIZE MX-derived Exchange servers over domain-based servers
    candidates.push(
      // 1. Direct MX-derived patterns (highest priority)
      mxHostname.replace('smtp', 'exchange').replace('mx', 'exchange').replace('mail', 'exchange'),
      mxHostname.replace(/^[^.]+\./, 'exchange.'), // Replace first subdomain with 'exchange'
      mxHostname.replace('smtp', 'outlook').replace('mx', 'outlook').replace('mail', 'outlook'),
      mxHostname.replace(/^[^.]+\./, 'outlook.'), // Replace first subdomain with 'outlook'
      // 2. Domain-based patterns (lower priority)
      `exchange.${domain}`,
      `outlook.${domain}`,
      `mail.${domain}`,
      `owa.${domain}` // Outlook Web Access
    );
  }
  
  return [...new Set(candidates)]; // Remove duplicates
}

/**
 * Map MX hostname to IMAP server using intelligent patterns
 */
function mapMXToIMAP(mxHostname: string, domain: string): string[] {
  const candidates: string[] = [];
  
  // Common IMAP server patterns based on MX hostname
  if (mxHostname.includes('google') || mxHostname.includes('gmail')) {
    candidates.push('imap.gmail.com');
  } else if (mxHostname.includes('outlook') || mxHostname.includes('office365') || mxHostname.includes('microsoft')) {
    candidates.push('outlook.office365.com');
  } else if (mxHostname.includes('yahoo')) {
    candidates.push('imap.mail.yahoo.com');
  } else if (mxHostname.includes('comcast') || mxHostname.includes('xfinity')) {
    candidates.push('imap.comcast.net');
  } else if (mxHostname.includes('godaddy') || mxHostname.includes('secureserver')) {
    candidates.push('imap.secureserver.net');
  } else if (mxHostname.includes('ionos') || mxHostname.includes('1and1')) {
    candidates.push('imap.ionos.com');
  } else {
    // PRIORITIZE MX-derived servers over domain-based servers
    candidates.push(
      // 1. Direct MX-derived patterns (highest priority)
      mxHostname.replace('smtp', 'imap').replace('mx', 'imap').replace('mail', 'imap'),
      mxHostname.replace(/^[^.]+\./, 'imap.'), // Replace first subdomain with 'imap'
      // 2. Domain-based patterns (lower priority)
      `imap.${domain}`,
      `mail.${domain}`
    );
  }
  
  return [...new Set(candidates)]; // Remove duplicates
}

/**
 * Enhanced auto-detect using INI-based server list, MX records, then fallback to presets
 */
export const autoDetectEmailSettings = async (
  options: TestConnectionOptions
): Promise<AutoDetectionResult> => {
  const { email, password, timeout = 10000, maxAttempts = 3, proxy, abortSignal } = options; // Reduced max attempts
  
  // Check for cancellation at start
  if (abortSignal?.aborted) {
    console.log(`🛑 Auto-detection cancelled for ${email} (aborted at start)`);
    return {
      success: false,
      error: 'Operation cancelled',
      testedConfigurations: 0,
    };
  }
  
  console.log(`⚡ Auto-detecting settings for ${email}...`);
  
  // Extract domain from email
  const domain = email.split('@')[1];
  if (!domain) {
    return {
      success: false,
      error: 'Invalid email format',
      testedConfigurations: 0,
    };
  }
  
  let testedCount = 0;
  const serverParser = new ServerListParser();
  
  // Single step: Get MX records and find server matches simultaneously
  const [mxRecords, serverMatches] = await Promise.all([
    getMXRecords(domain),
    Promise.resolve(serverParser.findMatches(email, []))
  ]);
  
  // Update server matches with MX intelligence
  const enhancedMatches = serverParser.findMatches(email, mxRecords);
  
  if (enhancedMatches.length > 0) {
    console.log(`🎯 Testing ${enhancedMatches.length} server configurations...`);
    
    // Test server matches in priority order (MX-based first, then domain-based)
    // Return immediately on first successful detection for speed
    for (const match of enhancedMatches.slice(0, 2)) { // Test only top 2 matches for speed
      if (testedCount >= 2) break; // Limit attempts for faster processing
      
      // Check for cancellation before each server match
      if (abortSignal?.aborted) {
        console.log(`🛑 Auto-detection cancelled for ${email} (aborted during server testing)`);
        return {
          success: false,
          error: 'Operation cancelled',
          testedConfigurations: testedCount,
        };
      }
      
      // Test protocols in the order they appear (MX-determined priority)
      // Exchange will come first only if MX records indicate Exchange support
      for (const protocol of match.protocols) {
        if (testedCount >= maxAttempts) break;
        
        // Check for cancellation before each protocol test
        if (abortSignal?.aborted) {
          console.log(`🛑 Auto-detection cancelled for ${email} (aborted during protocol testing)`);
          return {
            success: false,
            error: 'Operation cancelled',
            testedConfigurations: testedCount,
          };
        }
        
        console.log(`🎯 Found ${protocol} settings: ${match.server || match.url}:${match.port || 993}`);
        
        testedCount++;
        
        // Return settings immediately without testing connection
        // Connection will be tested separately with better error handling
        let serverConfig: any;
        
        if (protocol === 'Exchange' && match.url) {
          serverConfig = {
            type: 'Exchange',
            host: match.url,
            port: 443,
            secure: true,
          };
        } else if (protocol === 'Exchange' && match.server) {
          // Handle Exchange servers that use server field instead of url
          serverConfig = {
            type: 'Exchange',
            host: match.server,
            port: 443,
            secure: true,
          };
        } else if (match.server) {
          serverConfig = {
            type: protocol,
            host: match.server,
            port: match.port || (protocol === 'IMAP' ? 993 : 995),
            secure: protocol === 'IMAP' ? true : false, // Default to secure for IMAP
          };
        }
        
        if (serverConfig) {
          console.log(`✅ Auto-detection successful: ${serverConfig.type} ${serverConfig.host}:${serverConfig.port}`);
          return {
            success: true,
            data: {
              email,
              provider: { 
                type: serverConfig.type.toLowerCase(),
                name: `${serverConfig.type} (${serverConfig.host})`,
                host: serverConfig.host, 
                port: serverConfig.port, 
                secure: serverConfig.secure 
              },
              auth: { user: email, pass: password }
            },
            testedConfigurations: testedCount,
          };
        }
      }
    }
  }
  
  // Fallback to MX-based detection if enhanced server list didn't work
  if (mxRecords.length > 0) {
    console.log(`🔄 Trying MX-based detection for ${domain}...`);
    
    // Try each MX record and map to potential IMAP and Exchange servers
    // Optimized for speed - test only top MX record for faster processing
    for (const mxHostname of mxRecords.slice(0, 1)) { // Test only top MX record for speed
      // Check for cancellation before each MX record
      if (abortSignal?.aborted) {
        console.log(`🛑 Auto-detection cancelled for ${email} (aborted during MX testing)`);
        return {
          success: false,
          error: 'Operation cancelled',
          testedConfigurations: testedCount,
        };
      }
      
      const imapCandidates = mapMXToIMAP(mxHostname, domain);
      const exchangeCandidates = mapMXToExchange(mxHostname, domain);
      
      // Test IMAP candidates first (usually more reliable)
      // Optimized: test only first IMAP candidate for speed
      for (const imapHost of imapCandidates.slice(0, 1)) { // Test only first candidate
        if (testedCount >= 2) break; // Quick exit for speed
        
        // Check for cancellation before each IMAP test
        if (abortSignal?.aborted) {
          console.log(`🛑 Auto-detection cancelled for ${email} (aborted during IMAP testing)`);
          return {
            success: false,
            error: 'Operation cancelled',
            testedConfigurations: testedCount,
          };
        }
        
        console.log(`🎯 Found IMAP settings from MX: ${imapHost}:993`);
        
        testedCount++;
        
        // Return MX-derived IMAP settings immediately
        console.log(`✅ Auto-detection successful: IMAP ${imapHost}:993`);
        return {
          success: true,
          data: {
            email,
            provider: { 
              type: 'imap',
              name: `IMAP (${imapHost})`,
              host: imapHost, 
              port: 993, 
              secure: true 
            },
            auth: { user: email, pass: password }
          },
          testedConfigurations: testedCount,
        };
      }
      
      // Test Exchange candidates if IMAP didn't work
      // Optimized: test only first Exchange candidate for speed
      for (const exchangeHost of exchangeCandidates.slice(0, 1)) { // Test only first candidate
        if (testedCount >= 2) break; // Quick exit for speed
        
        console.log(`🧪 Testing MX-derived Exchange: ${exchangeHost}`);
        
        testedCount++;
        
        try {
          const result = await testConnection({
            type: 'Exchange',
            host: exchangeHost,
            port: 443,
            secure: true,
            email,
            password,
            timeout,
            proxy,
            abortSignal,
          });
          if (result.success) {
            console.log(`✅ Successfully connected using MX-derived Exchange: ${exchangeHost}!`);
            return {
              success: true,
              data: {
                email,
                provider: { 
                  type: 'exchange', // Normalize to simple protocol name
                  name: `MX-derived Exchange (${exchangeHost})`, // Keep descriptive name for display
                  host: exchangeHost, 
                  port: 443, 
                  secure: true 
                },
                auth: { user: email, pass: password }
              },
              testedConfigurations: testedCount,
            };
          }
        } catch (error: any) {
          console.log(`❌ Exchange Failed: ${error.message}`);
        }
      }
    }
  }
  
  // Step 4: Final fallback to preset-based detection (legacy approach)
  // TEMPORARILY DISABLED for testing - can be re-enabled if needed
  /*
  console.log(`🔄 Step 4: Enhanced methods failed, trying provider presets...`);
  const potentialConfigs = autoDetectSettings(email);
  
  if (potentialConfigs.length === 0) {
    return {
      success: false,
      error: 'No potential configurations found for this email domain',
      testedConfigurations: testedCount,
    };
  }
  
  console.log(`📋 Found ${potentialConfigs.length} preset configurations to test`);
  
  // Test preset configurations in priority order
  // Optimized: test only 1-2 presets for speed in bulk operations
  const maxTests = Math.min(2, potentialConfigs.length); // Limit to 2 presets max
  
  for (let i = 0; i < maxTests; i++) {
    const config = potentialConfigs[i];
    testedCount++;
    
    console.log(`🧪 Testing preset ${i + 1}/${maxTests}: ${config.provider} (${config.type}) ${config.host}:${config.port}`);
    console.log(`🔐 Testing connection with email: ${email}, password length: ${password.length}`);
    
    try {
      const result = await testConnection({
        type: config.type as 'IMAP' | 'POP3' | 'Exchange',
        host: config.host,
        port: config.port,
        secure: config.secure,
        email,
        password,
        timeout,
        proxy,
        abortSignal,
      });
      
      if (result.success) {
        console.log(`✅ Successfully connected using preset: ${config.provider}!`);
        return {
          success: true,
          data: {
            email,
            provider: { 
              type: config.type.toLowerCase(), // Normalize to simple protocol name
              name: config.provider, // Keep descriptive name for display
              host: config.host, 
              port: config.port, 
              secure: config.secure 
            },
            auth: { user: email, pass: password }
          },
          testedConfigurations: testedCount,
        };
      }
    } catch (error: any) {
      console.log(`❌ Preset Failed: ${error.message}`);
    }
  }
  */
  
  console.log(`⚡ Preset fallback temporarily disabled for testing - using only enhanced server list and MX-based detection`);
  
  return {
    success: false,
    error: `Failed to auto-detect settings after testing ${testedCount} configurations`,
    testedConfigurations: testedCount,
  };
};

interface TestConnectionParams {
  type: 'IMAP' | 'POP3' | 'Exchange';
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
  timeout: number;
  proxy?: {
    host: string;
    port: number;
    type: 'SOCKS5' | 'HTTP';
    userId?: string;
    password?: string;
  };
  abortSignal?: AbortSignal;
}

interface TestConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Test a specific email server configuration
 */
const testConnection = async (params: TestConnectionParams): Promise<TestConnectionResult> => {
  const { type, host, port, secure, email, password, timeout, proxy, abortSignal } = params;
  
  // Check for cancellation before starting connection test
  if (abortSignal?.aborted) {
    console.log(`🛑 Connection test cancelled for ${email} before starting`);
    return { success: false, error: 'Operation cancelled' };
  }
  
  console.log(`🔐 Testing connection with email: ${email}, password length: ${password?.length || 0}`);
  
  // Use shorter timeout for faster cancellation (5 seconds instead of 90)
  const connectionTimeout = Math.min(timeout, 5000);
  
  try {
    if (type === 'IMAP') {
      const handler = new ImapHandler();
      
      // Test connection with the provided credentials
      const authConfig = {
        host,
        port,
        secure,
        user: email,
        pass: password,
        authTimeout: connectionTimeout, // Use shorter timeout
        proxy,
      };
      
      console.log(`🔑 IMAP auth config: user=${authConfig.user}, pass length=${authConfig.pass?.length || 0}, timeout=${connectionTimeout}ms`);
      
      // Race connection attempt against abort signal for truly instant cancellation
      const connectionPromise = handler.connect(authConfig);
      
      let connected;
      if (abortSignal) {
        // Race between connection and abort signal
        const abortPromise = new Promise((_, reject) => {
          if (abortSignal.aborted) {
            reject(new Error('Operation cancelled'));
          } else {
            abortSignal.addEventListener('abort', () => {
              reject(new Error('Operation cancelled'));
            });
          }
        });
        
        connected = await Promise.race([connectionPromise, abortPromise]);
      } else {
        connected = await connectionPromise;
      }
      
      if (!connected) {
        return { success: false, error: 'Failed to establish IMAP connection' };
      }
      
      // For auto-detection, we only need to verify connection works
      // Skip folder enumeration to improve performance (especially with proxies)
      await handler.disconnect();
      
      return { success: true };
    } else if (type === 'POP3') {
      const handler = new Pop3Handler();
      
      // Test connection with the provided credentials
      const connected = await handler.connect({
        host,
        port,
        secure,
        user: email,
        pass: password,
        authTimeout: timeout,
        proxy,
      });
      
      if (!connected) {
        return { success: false, error: 'Failed to establish POP3 connection' };
      }
      
      // Test basic functionality - POP3 handler should have basic methods
      await handler.disconnect();
      
      return { success: true };
    } else if (type === 'Exchange') {
      const handler = new ExchangeHandler();
      
      // Test connection with the provided credentials
      // Exchange uses different URL patterns, try common EWS endpoints
      const exchangeUrls = [
        `https://${host}/EWS/Exchange.asmx`,
        `https://${host}/ews/exchange.asmx`,
        `https://outlook.office365.com/EWS/Exchange.asmx`, // Office 365
        `https://mail.${host}/EWS/Exchange.asmx`
      ];
      
      console.log(`🔑 Testing Exchange with ${exchangeUrls.length} EWS endpoint patterns`);
      
      for (const ewsUrl of exchangeUrls) {
        try {
          console.log(`🧪 Testing Exchange EWS endpoint: ${ewsUrl}`);
          
          const connected = await handler.connect({
            username: email,
            password: password,
            host: ewsUrl,
          });
          
          if (connected) {
            console.log(`✅ Exchange connection successful: ${ewsUrl}`);
            await handler.disconnect();
            return { success: true };
          }
        } catch (error: any) {
          console.log(`❌ Exchange endpoint failed: ${ewsUrl} - ${error.message}`);
          continue;
        }
      }
      
      await handler.disconnect();
      return { success: false, error: 'Failed to establish Exchange connection to any EWS endpoint' };
    } else {
      return { success: false, error: `Unsupported protocol type: ${type}` };
    }
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Connection failed' 
    };
  }
};

/**
 * Quick validation of email format
 */
export const validateEmailFormat = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Extract provider name from email domain for display purposes
 */
export const getProviderDisplayName = (email: string): string => {
  const domain = email.split('@')[1]?.toLowerCase();
  
  const providerMap: { [key: string]: string } = {
    'gmail.com': 'Gmail',
    'googlemail.com': 'Gmail',
    'outlook.com': 'Outlook',
    'hotmail.com': 'Hotmail',
    'live.com': 'Microsoft Live',
    'msn.com': 'MSN',
    'yahoo.com': 'Yahoo Mail',
    'ymail.com': 'Yahoo Mail',
    'aol.com': 'AOL Mail',
    'icloud.com': 'iCloud Mail',
    'me.com': 'iCloud Mail',
    'mac.com': 'iCloud Mail',
    'zoho.com': 'Zoho Mail',
    'protonmail.com': 'ProtonMail',
    'fastmail.com': 'Fastmail',
    'comcast.net': 'Comcast',
    'xfinity.com': 'Xfinity',
    'verizon.net': 'Verizon',
    'att.net': 'AT&T',
    'cox.net': 'Cox',
  };
  
  return providerMap[domain] || domain;
};
