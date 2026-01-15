export interface ProviderPreset {
  name: string;
  type: 'IMAP' | 'POP3' | 'Exchange';
  host: string;
  port: number;
  security: 'ssl' | 'starttls' | 'none';
  domains: string[];
  priority?: number; // Higher priority = try first
}

export const providerPresets: ProviderPreset[] = [
  // Major Email Providers - IMAP (Preferred)
  {
    name: 'Gmail',
    type: 'IMAP',
    host: 'imap.gmail.com',
    port: 993,
    security: 'ssl',
    domains: ['gmail.com', 'googlemail.com'],
    priority: 10,
  },
  {
    name: 'Outlook/Hotmail',
    type: 'IMAP',
    host: 'outlook.office365.com',
    port: 993,
    security: 'ssl',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    priority: 10,
  },
  {
    name: 'Yahoo Mail',
    type: 'IMAP',
    host: 'imap.mail.yahoo.com',
    port: 993,
    security: 'ssl',
    domains: ['yahoo.com', 'ymail.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au'],
    priority: 10,
  },
  {
    name: 'AOL Mail',
    type: 'IMAP',
    host: 'imap.aol.com',
    port: 993,
    security: 'ssl',
    domains: ['aol.com', 'aim.com'],
    priority: 9,
  },
  {
    name: 'iCloud Mail',
    type: 'IMAP',
    host: 'imap.mail.me.com',
    port: 993,
    security: 'ssl',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    priority: 9,
  },
  {
    name: 'Zoho Mail',
    type: 'IMAP',
    host: 'imap.zoho.com',
    port: 993,
    security: 'ssl',
    domains: ['zoho.com', 'zohomail.com'],
    priority: 8,
  },
  {
    name: 'ProtonMail',
    type: 'IMAP',
    host: '127.0.0.1', // Requires ProtonMail Bridge
    port: 1143,
    security: 'starttls',
    domains: ['protonmail.com', 'protonmail.ch', 'pm.me'],
    priority: 7,
  },
  {
    name: 'Fastmail',
    type: 'IMAP',
    host: 'imap.fastmail.com',
    port: 993,
    security: 'ssl',
    domains: ['fastmail.com', 'fastmail.fm'],
    priority: 8,
  },
  {
    name: 'Mail.com',
    type: 'IMAP',
    host: 'imap.mail.com',
    port: 993,
    security: 'ssl',
    domains: ['mail.com'],
    priority: 7,
  },
  {
    name: 'GMX',
    type: 'IMAP',
    host: 'imap.gmx.com',
    port: 993,
    security: 'ssl',
    domains: ['gmx.com', 'gmx.net', 'gmx.de'],
    priority: 7,
  },
  {
    name: 'Yandex',
    type: 'IMAP',
    host: 'imap.yandex.com',
    port: 993,
    security: 'ssl',
    domains: ['yandex.com', 'yandex.ru'],
    priority: 7,
  },
  
  // ISP Email Providers
  {
    name: 'Comcast/Xfinity',
    type: 'IMAP',
    host: 'imap.comcast.net',
    port: 993,
    security: 'ssl',
    domains: ['comcast.net', 'xfinity.com'],
    priority: 6,
  },
  {
    name: 'Verizon',
    type: 'IMAP',
    host: 'incoming.verizon.net',
    port: 993,
    security: 'ssl',
    domains: ['verizon.net'],
    priority: 6,
  },
  {
    name: 'AT&T',
    type: 'IMAP',
    host: 'imap.mail.att.net',
    port: 993,
    security: 'ssl',
    domains: ['att.net', 'sbcglobal.net', 'bellsouth.net'],
    priority: 6,
  },
  {
    name: 'Cox',
    type: 'IMAP',
    host: 'imap.cox.net',
    port: 993,
    security: 'ssl',
    domains: ['cox.net'],
    priority: 6,
  },
  
  // Hosting Provider Email Services
  {
    name: 'IONOS (1&1)',
    type: 'IMAP',
    host: 'imap.ionos.com',
    port: 993,
    security: 'ssl',
    domains: ['ionos.com', '1and1.com', '1und1.de'],
    priority: 8,
  },
  {
    name: 'GoDaddy',
    type: 'IMAP',
    host: 'imap.secureserver.net',
    port: 993,
    security: 'ssl',
    domains: ['secureserver.net'],
    priority: 7,
  },
  {
    name: 'Bluehost',
    type: 'IMAP',
    host: 'mail.bluehost.com',
    port: 993,
    security: 'ssl',
    domains: ['bluehost.com'],
    priority: 7,
  },
  {
    name: 'HostGator',
    type: 'IMAP',
    host: 'mail.hostgator.com',
    port: 993,
    security: 'ssl',
    domains: ['hostgator.com'],
    priority: 7,
  },
  {
    name: 'cPanel Generic',
    type: 'IMAP',
    host: 'mail.{domain}',
    port: 993,
    security: 'ssl',
    domains: [],
    priority: 5,
  },
  
  // Microsoft Exchange / Office 365 (EWS Support)
  {
    name: 'Office 365 Exchange',
    type: 'Exchange',
    host: 'outlook.office365.com',
    port: 443,
    security: 'ssl',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com'],
    priority: 9,
  },
  {
    name: 'Exchange Online',
    type: 'Exchange',
    host: 'outlook.office365.com',
    port: 443,
    security: 'ssl',
    domains: [], // Generic for any domain using Office 365
    priority: 8,
  },
  {
    name: 'Exchange Server (Generic)',
    type: 'Exchange',
    host: 'mail.{domain}',
    port: 443,
    security: 'ssl',
    domains: [],
    priority: 6,
  },
  {
    name: 'Exchange Server (Outlook)',
    type: 'Exchange',
    host: 'outlook.{domain}',
    port: 443,
    security: 'ssl',
    domains: [],
    priority: 6,
  },
  {
    name: 'Exchange Server (Exchange)',
    type: 'Exchange',
    host: 'exchange.{domain}',
    port: 443,
    security: 'ssl',
    domains: [],
    priority: 6,
  },
  
  // POP3 Fallbacks (Lower Priority)
  {
    name: 'Gmail POP3',
    type: 'POP3',
    host: 'pop.gmail.com',
    port: 995,
    security: 'ssl',
    domains: ['gmail.com', 'googlemail.com'],
    priority: 5,
  },
  {
    name: 'Outlook POP3',
    type: 'POP3',
    host: 'outlook.office365.com',
    port: 995,
    security: 'ssl',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    priority: 5,
  },
  {
    name: 'Yahoo POP3',
    type: 'POP3',
    host: 'pop.mail.yahoo.com',
    port: 995,
    security: 'ssl',
    domains: ['yahoo.com', 'ymail.com'],
    priority: 5,
  },
  
  // Exchange/Office 365
  {
    name: 'Exchange Online',
    type: 'Exchange',
    host: 'outlook.office365.com',
    port: 443,
    security: 'ssl',
    domains: [], // Usually custom domains
    priority: 8,
  },
];

// Auto-detection utilities
export interface DetectedSettings {
  email: string;
  provider: string;
  type: 'IMAP' | 'POP3' | 'Exchange';
  host: string;
  port: number;
  secure: boolean;
  username: string;
}

export const extractDomain = (email: string): string => {
  return email.split('@')[1]?.toLowerCase() || '';
};

export const findProviderByDomain = (domain: string): ProviderPreset[] => {
  return providerPresets
    .filter(preset => preset.domains.includes(domain))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

export const generateCommonHostPatterns = (domain: string): string[] => {
  const patterns = [
    // IMAP patterns
    `imap.${domain}`,
    `mail.${domain}`,
    `${domain}`,
    `imap.mail.${domain}`,
    `secure.${domain}`,
    
    // POP3 patterns
    `pop.${domain}`,
    `pop3.${domain}`,
    `pop.mail.${domain}`,
    
    // Exchange patterns
    `exchange.${domain}`,
    `outlook.${domain}`,
    `mail.${domain}`,
  ];
  
  return [...new Set(patterns)];
};

export const getCommonPorts = (type: 'IMAP' | 'POP3' | 'Exchange') => {
  switch (type) {
    case 'IMAP':
      return [
        { port: 993, secure: true },   // IMAPS
        { port: 143, secure: false },  // IMAP STARTTLS
      ];
    case 'POP3':
      return [
        { port: 995, secure: true },   // POP3S
        { port: 110, secure: false },  // POP3 STARTTLS
      ];
    case 'Exchange':
      return [
        { port: 443, secure: true },   // HTTPS
      ];
    default:
      return [];
  }
};

export const autoDetectSettings = (email: string): DetectedSettings[] => {
  const domain = extractDomain(email);
  const detectedConfigs: DetectedSettings[] = [];
  
  // First, try known providers
  const knownProviders = findProviderByDomain(domain);
  for (const provider of knownProviders) {
    detectedConfigs.push({
      email,
      provider: provider.name,
      type: provider.type,
      host: provider.host,
      port: provider.port,
      secure: provider.security === 'ssl',
      username: email,
    });
  }
  
  // Add common hosting provider patterns (even if domain not explicitly listed)
  const hostingProviders = [
    { name: 'IONOS (1&1)', host: 'imap.ionos.com', port: 993, secure: true, priority: 8 },
    { name: 'GoDaddy', host: 'imap.secureserver.net', port: 993, secure: true, priority: 7 },
    { name: 'Bluehost', host: 'mail.bluehost.com', port: 993, secure: true, priority: 7 },
    { name: 'HostGator', host: 'mail.hostgator.com', port: 993, secure: true, priority: 7 },
  ];
  
  for (const provider of hostingProviders) {
    detectedConfigs.push({
      email,
      provider: provider.name,
      type: 'IMAP',
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      username: email,
    });
  }
  
  // Generate common domain-based patterns
  const hostPatterns = generateCommonHostPatterns(domain);
  const protocols: ('IMAP' | 'POP3' | 'Exchange')[] = ['IMAP', 'Exchange', 'POP3'];
  
  for (const protocol of protocols) {
    const ports = getCommonPorts(protocol);
    for (const host of hostPatterns) {
      for (const { port, secure } of ports) {
        // Skip if host pattern doesn't match protocol
        if (protocol === 'IMAP' && host.startsWith('pop')) continue;
        if (protocol === 'POP3' && host.startsWith('imap')) continue;
        if (protocol === 'Exchange' && (host.startsWith('pop') || host.startsWith('imap'))) continue;
        
        detectedConfigs.push({
          email,
          provider: `Auto-detected ${protocol}`,
          type: protocol,
          host,
          port,
          secure,
          username: email,
        });
      }
    }
  }
  
  // Sort by priority (known providers first, then hosting providers, then patterns)
  return detectedConfigs.sort((a, b) => {
    const priorityA = a.provider.includes('Gmail') || a.provider.includes('Outlook') ? 10 :
                     a.provider.includes('IONOS') ? 8 :
                     a.provider.includes('GoDaddy') || a.provider.includes('Bluehost') || a.provider.includes('HostGator') ? 7 :
                     a.provider.includes('Auto-detected') ? 5 : 6;
    const priorityB = b.provider.includes('Gmail') || b.provider.includes('Outlook') ? 10 :
                     b.provider.includes('IONOS') ? 8 :
                     b.provider.includes('GoDaddy') || b.provider.includes('Bluehost') || b.provider.includes('HostGator') ? 7 :
                     b.provider.includes('Auto-detected') ? 5 : 6;
    return priorityB - priorityA;
  });
};
