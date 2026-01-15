interface ServerRule {
  type: 'mx' | 'domain';
  pattern: string;
  protocols: ('IMAP' | 'POP3' | 'Exchange')[];
  server: string;
  port?: number;
  encryption?: 'SSL' | 'TLS' | 'NONE';
  url?: string; // For Exchange
}

interface ParsedServerList {
  mxRules: ServerRule[];
  domainRules: ServerRule[];
}

/**
 * Parse Server_List.ini format for enhanced auto-detection
 */
export class ServerListParser {
  private serverList: ParsedServerList = {
    mxRules: [],
    domainRules: []
  };

  constructor() {
    this.loadServerList();
  }

  private loadServerList() {
    // Enhanced server list based on the provided INI file
    const serverRules: ServerRule[] = [
      // Microsoft/Office365 - Detect Exchange based on MX records
      { type: 'mx', pattern: '.outlook.com', protocols: ['Exchange', 'IMAP', 'POP3'], server: 'outlook.office365.com', port: 993, encryption: 'SSL', url: 'https://outlook.office365.com/EWS/Exchange.asmx' },
      { type: 'mx', pattern: '.protection.outlook.com', protocols: ['Exchange', 'IMAP'], server: 'outlook.office365.com', port: 993, encryption: 'SSL', url: 'https://outlook.office365.com/EWS/Exchange.asmx' },
      { type: 'mx', pattern: 'microsoft.com', protocols: ['Exchange', 'IMAP'], server: 'outlook.office365.com', port: 993, encryption: 'SSL', url: 'https://outlook.office365.com/EWS/Exchange.asmx' },
      { type: 'mx', pattern: '.partner.outlook.cn', protocols: ['IMAP'], server: 'partner.outlook.cn', port: 993, encryption: 'SSL' },
      
      // Common Exchange MX patterns
      { type: 'mx', pattern: 'exchange', protocols: ['Exchange'], server: '', url: 'https://#mx#/EWS/Exchange.asmx' },
      { type: 'mx', pattern: 'mail.exchange', protocols: ['Exchange'], server: '', url: 'https://#mx#/EWS/Exchange.asmx' },
      { type: 'mx', pattern: 'owa.', protocols: ['Exchange'], server: '', url: 'https://#mx#/EWS/Exchange.asmx' },
      
      // Microsoft domains
      { type: 'domain', pattern: 'hotmail.com', protocols: ['IMAP'], server: 'outlook.office365.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'msn.com', protocols: ['IMAP'], server: 'outlook.office365.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'live.com', protocols: ['IMAP'], server: 'outlook.office365.com', port: 993, encryption: 'SSL' },

      // Google/Gmail
      { type: 'mx', pattern: '.l.google.com', protocols: ['IMAP'], server: 'imap.gmail.com', port: 993, encryption: 'SSL' },

      // Yahoo
      { type: 'mx', pattern: '.yahoodns.net', protocols: ['IMAP'], server: 'imap.mail.yahoo.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'yahoo.co', protocols: ['IMAP'], server: 'imap.mail.yahoo.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'ymail.co', protocols: ['IMAP'], server: 'imap.mail.yahoo.com', port: 993, encryption: 'SSL' },

      // Exchange Detection - serverdata.net with correct server transformations
      { type: 'mx', pattern: '.serverdata.net', protocols: ['Exchange'], server: 'transform_serverdata', encryption: 'SSL' },
      { type: 'mx', pattern: 'exch092.serverdata.net', protocols: ['Exchange'], server: 'transform_serverdata', encryption: 'SSL' },
      { type: 'mx', pattern: 'west.smtp.mx.exch092.serverdata.net', protocols: ['Exchange'], server: 'transform_serverdata', encryption: 'SSL' },
      { type: 'mx', pattern: 'east.smtp.mx.exch092.serverdata.net', protocols: ['Exchange'], server: 'transform_serverdata', encryption: 'SSL' },

      // Hosting providers with specific IMAP settings
      { type: 'mx', pattern: '.ionos.com', protocols: ['IMAP'], server: 'imap.ionos.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.kundenserver.de', protocols: ['IMAP'], server: 'imap.ionos.de', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.1and1.com', protocols: ['IMAP'], server: 'imap.ionos.com', port: 993, encryption: 'SSL' },
      
      // GoDaddy
      { type: 'mx', pattern: '.secureserver.net', protocols: ['IMAP'], server: 'imap.secureserver.net', port: 993, encryption: 'SSL' },
      
      // Rackspace Email  
      { type: 'mx', pattern: '.emailsrvr.com', protocols: ['IMAP'], server: 'secure.emailsrvr.com', port: 993, encryption: 'SSL' },
      
      // Zoho Mail
      { type: 'mx', pattern: '.zoho.com', protocols: ['IMAP'], server: 'imap.zoho.com', port: 993, encryption: 'SSL' },
      
      // Namecheap Private Email
      { type: 'mx', pattern: '.privateemail.com', protocols: ['IMAP'], server: 'mail.privateemail.com', port: 993, encryption: 'SSL' },
      
      // Fastmail
      { type: 'mx', pattern: '.fastmail.com', protocols: ['IMAP'], server: 'imap.fastmail.com', port: 993, encryption: 'SSL' },

      // Other major providers
      { type: 'mx', pattern: '.mail.ru', protocols: ['IMAP'], server: 'imap.mail.ru', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.mail.com', protocols: ['IMAP'], server: 'imap.mail.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.mail.icloud.com', protocols: ['IMAP'], server: 'imap.mail.me.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.zoho.com', protocols: ['IMAP'], server: 'imap.zoho.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.ovh.net', protocols: ['IMAP'], server: 'ssl0.ovh.net', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.one.com', protocols: ['IMAP'], server: 'imap.one.com', port: 993, encryption: 'SSL' },

      // Chinese providers
      { type: 'mx', pattern: 'mxbiz1.qq.com', protocols: ['IMAP'], server: 'hwimap.exmail.qq.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: 'mx.qiye.163.com', protocols: ['IMAP'], server: 'hwimap.qiye.163.com', port: 993, encryption: 'SSL' },
      { type: 'mx', pattern: '.mxhichina.com', protocols: ['IMAP'], server: 'imap.mxhichina.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'vip.qq.com', protocols: ['IMAP'], server: 'imap.qq.com', port: 993, encryption: 'SSL' },

      // ISPs
      { type: 'domain', pattern: 'comcast.', protocols: ['IMAP'], server: 'imap.comcast.net', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'aol.com', protocols: ['IMAP'], server: 'imap.aol.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'att.net', protocols: ['IMAP'], server: 'imap.mail.yahoo.com', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: 'bellsouth.net', protocols: ['IMAP'], server: 'imap.mail.att.net', port: 993, encryption: 'SSL' },

      // Canadian ISPs
      { type: 'domain', pattern: 'shaw.ca', protocols: ['IMAP'], server: 'imap.shaw.ca', port: 143 },
      { type: 'domain', pattern: 'telus.net', protocols: ['IMAP'], server: 'imap.telus.net', port: 143 },
      { type: 'domain', pattern: 'cogeco.ca', protocols: ['IMAP'], server: 'imap.cogeco.ca', port: 143 },
      { type: 'domain', pattern: 'videotron.ca', protocols: ['IMAP'], server: 'imap.videotron.ca', port: 143 },

      // Generic business email fallback patterns (imap.domain.com priority)
      { type: 'domain', pattern: '.', protocols: ['IMAP'], server: 'imap.#domain#', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: '.', protocols: ['IMAP'], server: 'mail.#domain#', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: '.', protocols: ['IMAP'], server: '#mx#', port: 993, encryption: 'SSL' },
      { type: 'domain', pattern: '.', protocols: ['IMAP'], server: 'webmail.#domain#', port: 993, encryption: 'SSL' },
    ];

    // Separate into MX and domain rules
    this.serverList.mxRules = serverRules.filter(rule => rule.type === 'mx');
    this.serverList.domainRules = serverRules.filter(rule => rule.type === 'domain');
  }

  /**
   * Find matching server configurations for an email address and MX records
   */
  public findMatches(email: string, mxRecords: string[]): ServerRule[] {
    const domain = email.split('@')[1];
    const matches: ServerRule[] = [];

    // Step 1: Check MX-based rules (highest priority)
    for (const mxRecord of mxRecords) {
      for (const rule of this.serverList.mxRules) {
        if (this.matchesPattern(mxRecord, rule.pattern)) {
          const processedRule = this.processVariables(rule, domain, mxRecord);
          matches.push(processedRule);
        }
      }
    }

    // Step 2: Check domain-based rules (but exclude generic fallbacks for now)
    for (const rule of this.serverList.domainRules) {
      if (rule.pattern !== '.' && this.matchesPattern(domain, rule.pattern)) {
        const processedRule = this.processVariables(rule, domain, mxRecords[0]);
        matches.push(processedRule);
      }
    }

    // Step 3: Add generic fallback rules last (lowest priority)
    for (const rule of this.serverList.domainRules) {
      if (rule.pattern === '.') {
        const processedRule = this.processVariables(rule, domain, mxRecords[0]);
        matches.push(processedRule);
      }
    }

    // Step 4: Add Exchange fallback patterns only if no MX-based Exchange was found
    // and if domain characteristics suggest it might support Exchange
    const hasExchangeMatch = matches.some(match => match.protocols.includes('Exchange'));
    if (!hasExchangeMatch && this.mightSupportExchange(domain, mxRecords)) {
      const exchangeFallbacks: ServerRule[] = [
        { type: 'domain', pattern: '.', protocols: ['Exchange'], server: '', url: `https://autodiscover.${domain}/EWS/Exchange.asmx` },
        { type: 'domain', pattern: '.', protocols: ['Exchange'], server: '', url: `https://webmail.${domain}/EWS/Exchange.asmx` },
        { type: 'domain', pattern: '.', protocols: ['Exchange'], server: '', url: `https://mail.${domain}/EWS/Exchange.asmx` },
      ];
      
      if (mxRecords[0]) {
        exchangeFallbacks.push({ type: 'domain', pattern: '.', protocols: ['Exchange'], server: '', url: `https://${mxRecords[0]}/EWS/Exchange.asmx` });
      }
      
      matches.push(...exchangeFallbacks);
    }

    return matches;
  }

  /**
   * Determine if a domain might support Exchange based on domain characteristics and MX records
   */
  private mightSupportExchange(domain: string, mxRecords: string[]): boolean {
    // Don't suggest Exchange for obvious consumer/free email domains
    const consumerDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 
      'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
      'protonmail.com', 'tutanota.com', 'mail.com'
    ];
    
    if (consumerDomains.includes(domain.toLowerCase())) {
      return false;
    }

    // Check MX records for Exchange indicators
    const mxString = mxRecords.join(' ').toLowerCase();
    if (mxString.includes('outlook') || 
        mxString.includes('office365') || 
        mxString.includes('microsoft') ||
        mxString.includes('exchange') ||
        mxString.includes('protection.outlook.com')) {
      return true;
    }

    // For business domains (non-consumer), only suggest Exchange if:
    // 1. Domain has a TLD that suggests business use
    // 2. MX records don't clearly indicate a specific provider (like Google)
    const businessTlds = ['.com', '.org', '.net', '.biz', '.co', '.io', '.gov', '.edu'];
    const hasBusinessTld = businessTlds.some(tld => domain.endsWith(tld));
    
    // Don't suggest Exchange if MX clearly points to other providers
    if (mxString.includes('google') || mxString.includes('gmail') ||
        mxString.includes('yahoo') || mxString.includes('zoho') ||
        mxString.includes('mail.ru') || mxString.includes('yandex')) {
      return false;
    }

    // For business domains with custom MX or unknown providers, suggest Exchange as fallback
    return hasBusinessTld && mxRecords.length > 0;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '.') return true; // Universal match
    
    if (pattern.startsWith('.')) {
      return value.includes(pattern.substring(1));
    }
    
    return value.includes(pattern);
  }

  private processVariables(rule: ServerRule, domain: string, primaryMx?: string): ServerRule {
    const processed = { ...rule };
    
    if (processed.server) {
      // Handle special serverdata.net transformation
      if (processed.server === 'transform_serverdata' && primaryMx) {
        processed.server = this.transformServerdataHost(primaryMx);
      } else {
        processed.server = processed.server
          .replace('#domain#', domain)
          .replace('#mx#', primaryMx || domain);
      }
    }
    
    if (processed.url) {
      processed.url = processed.url
        .replace('#domain#', domain)
        .replace('#mx#', primaryMx || domain);
    }
    
    return processed;
  }

  private transformServerdataHost(mxHost: string): string {
    // Transform serverdata.net MX records to Exchange servers
    // Examples:
    // east.smtp.exch028.serverdata.net → east.exch028.serverdata.net
    // west.smtp.exch028.serverdata.net → west.exch028.serverdata.net
    // west.smtp.mx.exch092.serverdata.net → west.exch092.serverdata.net  
    // east.smtp.mx.exch092.serverdata.net → east.exch092.serverdata.net
    
    let transformed = mxHost;
    
    // Pattern 1: Remove both .smtp.mx. (for newer patterns)
    if (transformed.includes('.smtp.mx.')) {
      transformed = transformed.replace('.smtp.mx.', '.');
    }
    // Pattern 2: Remove just .smtp. (for older patterns)  
    else if (transformed.includes('.smtp.')) {
      transformed = transformed.replace('.smtp.', '.');
    }
    
    // Pattern 3: Handle mx1.smtp → west
    if (transformed.includes('mx1.smtp')) {
      transformed = transformed.replace('mx1.smtp', 'west');
    }
    
    // Pattern 4: Handle mx2.smtp → east
    if (transformed.includes('mx2.smtp')) {
      transformed = transformed.replace('mx2.smtp', 'east');
    }
    
    return transformed;
  }
}
