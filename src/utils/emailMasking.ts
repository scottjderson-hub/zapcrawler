/**
 * Email masking utility for free tier users
 * Masks email addresses while keeping them recognizable
 */

export interface MaskingOptions {
  localMinVisible?: number; // Minimum characters to show in local part
  localMaxVisible?: number; // Maximum characters to show in local part  
  domainMinVisible?: number; // Minimum characters to show in domain
  domainMaxVisible?: number; // Maximum characters to show in domain
  maskChar?: string; // Character to use for masking
}

const DEFAULT_OPTIONS: Required<MaskingOptions> = {
  localMinVisible: 1,
  localMaxVisible: 3,
  domainMinVisible: 1,
  domainMaxVisible: 3,
  maskChar: '*'
};

/**
 * Creates a deterministic but seemingly random mask pattern for an email
 * Same email will always generate the same mask pattern
 */
export function maskEmail(email: string, options: MaskingOptions = {}): string {
  if (!email || !email.includes('@')) {
    return email;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [localPart, domain] = email.split('@');
  
  if (!localPart || !domain) {
    return email;
  }

  // Use email as seed for deterministic "randomness"
  const seed = email.toLowerCase().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const maskedLocal = maskPart(localPart, opts.localMinVisible, opts.localMaxVisible, opts.maskChar, seed);
  const maskedDomain = maskDomain(domain, opts.domainMinVisible, opts.domainMaxVisible, opts.maskChar, seed);
  
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Mask a part of the email (local part or domain part)
 */
function maskPart(
  part: string, 
  minVisible: number, 
  maxVisible: number, 
  maskChar: string, 
  seed: number
): string {
  if (part.length <= minVisible) {
    return part;
  }

  // Calculate how many characters to show (deterministic based on seed)
  const visibleRange = maxVisible - minVisible + 1;
  const visibleCount = Math.min(
    maxVisible, 
    Math.max(minVisible, minVisible + (seed % visibleRange))
  );

  // Determine which characters to show (start and end)
  const startChars = Math.ceil(visibleCount / 2);
  const endChars = Math.floor(visibleCount / 2);
  
  const start = part.substring(0, startChars);
  const end = endChars > 0 ? part.substring(part.length - endChars) : '';
  
  // Calculate mask length
  const maskLength = Math.max(1, part.length - startChars - endChars);
  const mask = maskChar.repeat(maskLength);
  
  return `${start}${mask}${end}`;
}

/**
 * Mask domain with special handling for TLD and subdomains
 */
function maskDomain(
  domain: string, 
  minVisible: number, 
  maxVisible: number, 
  maskChar: string, 
  seed: number
): string {
  const parts = domain.split('.');
  
  if (parts.length === 1) {
    // Single domain part, mask normally
    return maskPart(domain, minVisible, maxVisible, maskChar, seed);
  }

  // For multi-part domains, mask each part separately but preserve structure
  const maskedParts = parts.map((part, index) => {
    if (part.length <= 2 && index === parts.length - 1) {
      // Preserve short TLDs (.com, .org, etc.)
      return part;
    }
    
    // Use different seed offset for each part
    const partSeed = seed + index * 37;
    
    if (part.length <= 3) {
      // Short parts: show first char + mask
      return part.charAt(0) + maskChar.repeat(Math.max(1, part.length - 1));
    }
    
    return maskPart(part, minVisible, maxVisible, maskChar, partSeed);
  });

  return maskedParts.join('.');
}

/**
 * Check if an email should be masked based on user's plan
 */
export function shouldMaskEmail(userPlan: string): boolean {
  return userPlan === 'community' || userPlan === 'free';
}

/**
 * Mask an array of emails based on user plan
 */
export function maskEmailArray(emails: string[], userPlan: string, options?: MaskingOptions): string[] {
  if (!shouldMaskEmail(userPlan)) {
    return emails;
  }
  
  return emails.map(email => maskEmail(email, options));
}

/**
 * Mask an array of emails with first N emails unmasked (preview functionality)
 */
export function maskEmailArrayWithPreview(emails: string[], userPlan: string, previewCount: number = 10, options?: MaskingOptions): string[] {
  if (!shouldMaskEmail(userPlan)) {
    return emails;
  }

  return emails.map((email, index) => {
    if (index < previewCount) {
      return email; // Show first N emails unmasked
    }
    return maskEmail(email, options); // Mask the rest
  });
}

/**
 * Mask emails with domain preview mode - shows domain but masks local part
 * Format: b*****@gmail.com (shows domain clearly, masks local part heavily)
 */
export function maskEmailWithDomainPreview(email: string): string {
  if (!email || !email.includes('@')) {
    return email;
  }

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  // For local part: show first character + asterisks
  const maskedLocal = localPart.length > 1
    ? localPart.charAt(0) + '*'.repeat(Math.max(1, localPart.length - 1))
    : localPart;

  // Keep domain completely visible for preview mode
  return `${maskedLocal}@${domain}`;
}

/**
 * Handle partial token deduction masking with domain preview
 * Shows visible emails unmasked, and masked emails with domain preview
 */
export function maskEmailArrayPartialTokens(
  emails: string[],
  visibleCount: number,
  showDomainPreview: boolean = true
): string[] {
  return emails.map((email, index) => {
    if (index < visibleCount) {
      return email; // Show first N emails unmasked (user paid for these)
    }

    if (showDomainPreview) {
      return maskEmailWithDomainPreview(email); // Show domain preview for unpaid emails
    } else {
      return maskEmail(email); // Standard masking
    }
  });
}

/**
 * Mask emails in a structured object (useful for API responses)
 */
export function maskEmailsInObject<T extends Record<string, any>>(
  obj: T, 
  userPlan: string, 
  emailFields: string[] = ['email', 'from', 'to', 'sender', 'recipient'],
  options?: MaskingOptions
): T {
  if (!shouldMaskEmail(userPlan)) {
    return obj;
  }

  const masked = { ...obj };

  function processValue(value: any, key: string): any {
    if (typeof value === 'string' && emailFields.includes(key.toLowerCase())) {
      if (value.includes('@')) {
        return maskEmail(value, options);
      }
    } else if (Array.isArray(value)) {
      return value.map((item, index) => processValue(item, `${key}[${index}]`));
    } else if (value && typeof value === 'object') {
      return maskEmailsInObject(value, userPlan, emailFields, options);
    }
    
    return value;
  }

  for (const [key, value] of Object.entries(masked)) {
    masked[key] = processValue(value, key);
  }

  return masked;
}

// Example usage and test cases
export const examples = {
  basic: [
    { original: 'd1aniel@yahoo.com', masked: maskEmail('d1aniel@yahoo.com') },
    { original: 'john.doe@company.com', masked: maskEmail('john.doe@company.com') },
    { original: 'test@subdomain.example.org', masked: maskEmail('test@subdomain.example.org') },
  ],
  
  // Test that same email always produces same mask
  consistency: (() => {
    const email = 'testuser@example.com';
    const mask1 = maskEmail(email);
    const mask2 = maskEmail(email);
    return { email, mask1, mask2, consistent: mask1 === mask2 };
  })(),
};