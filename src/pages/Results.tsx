import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, 
  Play,
  Square,
  Upload,
  Mail,
  Building,
  Globe,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  Copy,
  FileText,
  Loader2,
  Filter
} from "lucide-react";
import { toast } from "sonner";

// Constants for performance optimization
const STORAGE_KEY = 'email-sorter-state';
const CACHE_EXPIRY_HOURS = 24;
const MAX_EMAILS_LOCALSTORAGE = 50000;
const BATCH_SIZE_OPTIMIZED = 20; // Increased batch size for better performance
const DEBOUNCE_DELAY = 300; // Debounce for auto-save

// LocalStorage utilities
const saveToStorage = (data: any) => {
  try {
    const storageData = {
      ...data,
      timestamp: Date.now(),
      version: '1.0'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
    toast.warning('Unable to save progress. Storage may be full.');
  }
};

const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    const age = Date.now() - data.timestamp;
    const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    // Check if data is too old
    if (age > maxAge) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const clearStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const Sorter = () => {
  // State management
  const [emailInput, setEmailInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [results, setResults] = useState<any>({});
  const [stats, setStats] = useState({
    total: 0,
    processed: 0,
    unique: 0,
    providers: 0
  });
  const [activeExportTab, setActiveExportTab] = useState("provider");
  const [fileName, setFileName] = useState("No file chosen");
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [isRestored, setIsRestored] = useState(false);
  const [showRestoredNotification, setShowRestoredNotification] = useState(false);
  const [analysisState, setAnalysisState] = useState<{
    isRunning: boolean;
    currentBatch: number;
    totalBatches: number;
    processedDomains: string[];
    pendingDomains: string[];
    currentResults: any;
  }>({
    isRunning: false,
    currentBatch: 0,
    totalBatches: 0,
    processedDomains: [],
    pendingDomains: [],
    currentResults: {}
  });
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect duplicates when email input changes
  useEffect(() => {
    if (emailInput.trim()) {
      const emails = extractEmails(emailInput);
      const uniqueEmails = [...new Set(emails)];
      const duplicates = emails.length - uniqueEmails.length;
      setDuplicateCount(duplicates);
      setShowDuplicates(duplicates > 0);
    } else {
      setDuplicateCount(0);
      setShowDuplicates(false);
    }
  }, [emailInput]);

  // Debounced auto-save function
  const debouncedSave = useCallback(
    useMemo(() => {
      let timeoutId: NodeJS.Timeout;
      return (data: any) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const emailCount = Object.values(data.results || {}).reduce((sum: number, group: any) => sum + (group.emails?.length || 0), 0);
          console.log('Saving to localStorage:', {
            emailInputLength: data.emailInput?.length || 0,
            resultsCount: Object.keys(data.results || {}).length,
            emailCount,
            maxAllowed: MAX_EMAILS_LOCALSTORAGE
          });
          
          if (emailCount <= MAX_EMAILS_LOCALSTORAGE) {
            saveToStorage(data);
          } else {
            console.warn('Not saving - email count exceeds limit:', emailCount);
          }
        }, DEBOUNCE_DELAY);
      };
    }, [])
  , []);

  // Auto-save state changes
  useEffect(() => {
    // Save whenever we have meaningful data, regardless of restoration status
    if ((emailInput.trim() || Object.keys(results).length > 0) && !isAnalyzing) {
      debouncedSave({
        emailInput,
        results,
        stats,
        selectedProvider,
        progress,
        progressText
      });
    }
  }, [emailInput, results, stats, selectedProvider, progress, progressText, isAnalyzing, debouncedSave]);

  // Check if analysis can be resumed
  const canResumeAnalysis = (restored: any) => {
    if (!restored.analysisState) return false;
    const { isRunning, pendingDomains, processedDomains } = restored.analysisState;
    return isRunning && pendingDomains && pendingDomains.length > 0;
  };

  // Resume interrupted analysis
  const resumeAnalysis = async (restored: any) => {
    const { analysisState: state, emailInput: restoredInput } = restored;
    console.log('Resuming analysis from batch', state.currentBatch, 'of', state.totalBatches);
    
    setIsAnalyzing(true);
    setAnalysisState(state);
    
    toast.info('Resuming interrupted analysis...', {
      description: `Continuing from ${state.processedDomains.length}/${state.processedDomains.length + state.pendingDomains.length} domains processed.`
    });

    // Continue analysis with pending domains
    await continueAnalysisFromState(state, restoredInput);
  };

  // Restore state from localStorage on component mount
  useEffect(() => {
    const restored = loadFromStorage();
    if (restored) {
      try {
        // Check if we have meaningful data to restore
        const hasResults = restored.results && Object.keys(restored.results).length > 0;
        const hasInput = restored.emailInput && restored.emailInput.trim();
        const canResume = canResumeAnalysis(restored);
        
        if (hasResults || hasInput) {
          console.log('Restoring data from localStorage:', {
            emailInputLength: restored.emailInput?.length || 0,
            resultsCount: Object.keys(restored.results || {}).length,
            statsTotal: restored.stats?.total || 0,
            canResumeAnalysis: canResume
          });
          
          setEmailInput(restored.emailInput || '');
          setResults(restored.results || {});
          setStats(restored.stats || { total: 0, processed: 0, unique: 0, providers: 0 });
          setSelectedProvider(restored.selectedProvider || 'all');
          setProgress(restored.progress || 0);
          setProgressText(restored.progressText || '');
          setIsRestored(true);
          
          if (restored.analysisState) {
            setAnalysisState(restored.analysisState);
          }
          
          if (canResume) {
            // Show option to resume analysis
            setShowRestoredNotification(true);
            toast.success('Interrupted analysis detected!', {
              description: 'Click Resume to continue where you left off, or start a new analysis.',
              duration: 10000
            });
          } else if (hasResults) {
            const emailCount = Object.values(restored.results || {}).reduce((sum: number, group: any) => sum + (group.emails?.length || 0), 0);
            setShowRestoredNotification(true);
            toast.success('Previous analysis restored successfully!', {
              description: `Found ${emailCount} emails from your last session.`
            });
            
            // Auto-hide notification after 5 seconds
            setTimeout(() => setShowRestoredNotification(false), 5000);
          }
        } else {
          setIsRestored(true);
        }
      } catch (error) {
        console.warn('Error restoring state:', error);
        clearStorage();
        setIsRestored(true);
      }
    } else {
      setIsRestored(true);
    }
  }, []); // Run only once on mount

  // Enhanced MX Analyzer class (converted to React hooks pattern)
  const [mxCache, setMxCache] = useState(new Map());
  const [responseTimeStats, setResponseTimeStats] = useState(new Map());
  const [retryQueue, setRetryQueue] = useState(new Map());
  // Enhanced provider detection from sorter.html
  const [commonMxCache] = useState(new Map([
    ['gmail.com', 'gmail-smtp-in.l.google.com'],
    ['googlemail.com', 'gmail-smtp-in.l.google.com'],
    ['outlook.com', 'outlook-com.olc.protection.outlook.com'],
    ['hotmail.com', 'hotmail-com.olc.protection.outlook.com'],
    ['yahoo.com', 'mta5.am0.yahoodns.net'],
    ['icloud.com', 'mx01.mail.icloud.com'],
    ['zoho.com', 'mx.zoho.com']
  ]));

  // Utility functions
  const extractEmails = (text: string) => {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex) || [];
    return [...new Set(emails.map(email => email.toLowerCase()))];
  };

  const getDomainFromEmail = (email: string) => {
    return email.split('@')[1] || '';
  };

  // Enhanced provider detection from sorter.html
  const detectProvider = (mxRecord: string) => {
    // First check for exact matches for specific servers
    const exactMatches: { [key: string]: string } = {
      'mx001.netsol.xion.oxcs.net': 'networksolution',
      'us-smtp-inbound-1.mimecast.com': 'mimecast'
    };
    
    const mx = mxRecord.toLowerCase();
    
    // Check exact matches first
    if (exactMatches.hasOwnProperty(mx)) {
      return exactMatches[mx];
    }

    // Enhanced pattern matching with specific order for better detection
    // Check for Serverdata first
    if (mx.includes('serverdata.net') || mx.includes('smtp.mx.exch') || mx.includes('serverdata')) {
      return 'serverdata';
    }

    // Check for different types of Outlook - order matters (most specific first)
    if (mx.includes('protection.outlook.com')) {
      // Check for government institutions (.gov domains)
      if (mx.includes('.gov') || mx.includes('gov-') || mx.includes('-gov.')) {
        return 'gov_outlook';
      }
      // Check for educational institutions
      if (mx.includes('edu') || mx.includes('school') || mx.includes('university') || 
          mx.includes('college') || mx.includes('k12') || mx.includes('academic')) {
        return 'edu_outlook';
      }
      // Check for personal Outlook accounts (olc.protection.outlook.com)
      if (mx.includes('olc.protection.outlook.com')) {
        return 'outlook';
      }
      // Check for business/office365 (mail.protection.outlook.com and other patterns)
      return 'office365_outlook';
    }

    const providers: { [key: string]: string[] } = {
      'gmail': ['gmail', 'googlemail', 'aspmx'],
      'outlook': ['outlook', 'hotmail', 'live'], // This will catch general outlook.com domains
      'yahoo': ['yahoo', 'yahoodns'],
      'zoho': ['zoho'],
      'godaddy': ['godaddy', 'secureserver'],
      'namecheap': ['registrar-servers'],
      'cloudflare': ['cloudflare'],
      'aws': ['amazonses', 'amazon'],
      'google_workspace': ['google.com', 'googlemail.com'],
      'microsoft365': ['mail.eo.outlook.com'], // Keep this for other Microsoft 365 patterns
      'protonmail': ['protonmail'],
      'fastmail': ['fastmail'],
      'mailgun': ['mailgun'],
      'sendgrid': ['sendgrid'],
      'networksolution': ['netsol'],
      'mimecast': ['mimecast'],
      'comcast': ['comcast.net', 'mxge.comcast.net'], // Added Comcast support
      'verizon': ['verizon.net', 'vzwpix.com'],
      'att': ['att.net', 'sbcglobal.net'],
      'cox': ['cox.net'],
      'charter': ['charter.net', 'spectrum.net'],
      'custom': ['custom', 'private']
    };

    for (const [provider, keywords] of Object.entries(providers)) {
      if (keywords.some(keyword => mx.includes(keyword))) {
        return provider;
      }
    }
    return 'other';
  };

  // Continue analysis from saved state
  const continueAnalysisFromState = async (state: any, emailInput: string) => {
    const { pendingDomains, processedDomains, currentResults } = state;
    
    if (!pendingDomains || pendingDomains.length === 0) {
      console.log('No pending domains to process');
      setIsAnalyzing(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const total = processedDomains.length + pendingDomains.length;
      let processed = processedDomains.length;
      let results = { ...currentResults };

      // Group emails by domain for remaining domains
      const emails = extractEmails(emailInput);
      const emailsByDomain = new Map<string, string[]>();
      emails.forEach(email => {
        const domain = getDomainFromEmail(email);
        if (pendingDomains.includes(domain)) {
          if (!emailsByDomain.has(domain)) {
            emailsByDomain.set(domain, []);
          }
          emailsByDomain.get(domain)!.push(email);
        }
      });

      // Process remaining domains
      const batchSize = BATCH_SIZE_OPTIMIZED;
      for (let i = 0; i < pendingDomains.length; i += batchSize) {
        if (signal.aborted) break;
        
        const batch = pendingDomains.slice(i, i + batchSize);
        const batchPromises = batch.map(async (domain: string) => {
          try {
            const mxRecord = await getMXRecord(domain, signal);
            const provider = mxRecord === 'Lookup Failed' || mxRecord === 'No MX Record' 
              ? detectProviderFromDomain(domain) 
              : detectProvider(mxRecord);
            const domainEmails = emailsByDomain.get(domain) || [];
            
            return {
              domain,
              mxRecord,
              provider,
              emails: domainEmails,
              count: domainEmails.length
            };
          } catch (error) {
            const domainEmails = emailsByDomain.get(domain) || [];
            return {
              domain,
              mxRecord: 'Lookup Failed',
              provider: detectProviderFromDomain(domain),
              emails: domainEmails,
              count: domainEmails.length
            };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        let batchProcessed = 0;
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const data = result.value;
            if (!results[data.mxRecord]) {
              results[data.mxRecord] = {
                mxServer: data.mxRecord,
                provider: data.provider,
                domains: [],
                emails: [],
                totalCount: 0
              };
            }
            
            results[data.mxRecord].domains.push(data.domain);
            results[data.mxRecord].emails.push(...data.emails);
            results[data.mxRecord].totalCount += data.count;
            batchProcessed++;
          }
        });
        
        processed += batchProcessed;
        const progressPercent = Math.min((processed / total) * 100, 100);
        setProgress(progressPercent);
        setProgressText(`Processed ${processed}/${total} domains...`);
        setStats(prev => ({ ...prev, processed }));
        setResults({...results});
        
        // Update analysis state for continuation
        const remainingDomains = pendingDomains.slice(i + batchSize);
        const updatedState = {
          ...state,
          currentBatch: Math.floor((i + batchSize) / batchSize),
          processedDomains: [...processedDomains, ...batch],
          pendingDomains: remainingDomains,
          currentResults: results
        };
        setAnalysisState(updatedState);
        
        // Save progress
        if (processed % 50 === 0) {
          const progressData = {
            emailInput,
            results: {...results},
            stats: { total, processed, unique: emails.length, providers: Object.keys(results).length },
            selectedProvider,
            progress: progressPercent,
            progressText: `Processed ${processed}/${total} domains...`,
            analysisState: updatedState
          };
          saveToStorage(progressData);
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analysis completed
      if (!signal.aborted) {
        const providerCount = new Set(Object.values(results).map((r: any) => r.provider)).size;
        setResults(results);
        setStats(prev => ({ ...prev, providers: providerCount }));
        setProgressText('Analysis complete!');
        setAnalysisState(prev => ({ ...prev, isRunning: false }));
        
        toast.success(`Analysis resumed and completed! Found ${emails.length} unique emails across ${total} domains.`);
        
        // Save final results
        const finalData = {
          emailInput,
          results,
          stats: { total, processed: total, unique: emails.length, providers: providerCount },
          selectedProvider,
          progress: 100,
          progressText: 'Analysis complete!',
          analysisState: {
            isRunning: false,
            currentBatch: 0,
            totalBatches: 0,
            processedDomains: [],
            pendingDomains: [],
            currentResults: {}
          }
        };
        saveToStorage(finalData);
      }
    } catch (error: any) {
      console.error('Error continuing analysis:', error);
      toast.error('Error continuing analysis: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Fallback provider detection based on domain when MX lookup fails
  const detectProviderFromDomain = (domain: string) => {
    const domainLower = domain.toLowerCase();
    
    // Direct domain matching for major providers
    const domainProviders: { [key: string]: string[] } = {
      'gmail': ['gmail.com', 'googlemail.com'],
      'outlook': ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
      'yahoo': ['yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.fr', 'yahoo.de'],
      'zoho': ['zoho.com', 'zohomail.com'],
      'protonmail': ['protonmail.com', 'pm.me'],
      'fastmail': ['fastmail.com', 'fastmail.fm'],
      'icloud': ['icloud.com', 'me.com', 'mac.com'],
      'comcast': ['comcast.net'],
      'verizon': ['verizon.net', 'vzwpix.com'],
      'att': ['att.net', 'sbcglobal.net', 'att.com'],
      'cox': ['cox.net', 'cox.com'],
      'charter': ['charter.net', 'spectrum.net'],
      'aol': ['aol.com'],
      'yandex': ['yandex.com', 'yandex.ru'],
      'mailru': ['mail.ru', 'inbox.ru', 'list.ru']
    };

    // Check for exact domain matches
    for (const [provider, domains] of Object.entries(domainProviders)) {
      if (domains.includes(domainLower)) {
        return provider;
      }
    }

    // Check for partial matches in domain
    if (domainLower.includes('gmail') || domainLower.includes('google')) return 'gmail';
    if (domainLower.includes('outlook') || domainLower.includes('hotmail') || domainLower.includes('live')) return 'outlook';
    if (domainLower.includes('yahoo')) return 'yahoo';
    if (domainLower.includes('comcast')) return 'comcast';
    if (domainLower.includes('verizon')) return 'verizon';
    if (domainLower.includes('att')) return 'att';
    if (domainLower.includes('cox')) return 'cox';
    if (domainLower.includes('charter') || domainLower.includes('spectrum')) return 'charter';
    
    return 'other';
  };

  const getAdaptiveTimeout = () => {
    const avgResponseTime = Array.from(responseTimeStats.values())
      .reduce((sum, time) => sum + time, 0) / responseTimeStats.size;
    return Math.max(3000, Math.min(8000, avgResponseTime * 2));
  };

  const updateResponseTimeStats = (domain: string, responseTime: number) => {
    setResponseTimeStats(prev => new Map(prev.set(domain, responseTime)));
  };

  // Enhanced MX record lookup with optimizations
  const getMXRecord = async (domain: string, signal: AbortSignal) => {
    // Check cache first - fastest path
    if (mxCache.has(domain)) {
      return mxCache.get(domain);
    }

    // Check common MX cache for faster lookups
    if (commonMxCache.has(domain)) {
      const cachedMx = commonMxCache.get(domain)!;
      setMxCache(prev => new Map(prev.set(domain, cachedMx)));
      return cachedMx;
    }

    // Try to infer provider from domain name first (fastest path for known domains)
    // This avoids unnecessary DNS lookups for common domains
    const inferredProvider = detectProviderFromDomain(domain);
    if (inferredProvider !== 'unknown') {
      // For well-known domains, we can often skip the MX lookup entirely
      // This dramatically speeds up processing for common email providers
      const knownMxMap: Record<string, string> = {
        'gmail': 'gmail-smtp-in.l.google.com',
        'google': 'gmail-smtp-in.l.google.com',
        'outlook': 'outlook-com.olc.protection.outlook.com',
        'hotmail': 'outlook-com.olc.protection.outlook.com',
        'live': 'outlook-com.olc.protection.outlook.com',
        'yahoo': 'mta7.am0.yahoodns.net',
        'aol': 'mx.aol.com',
        'icloud': 'mx01.mail.icloud.com',
        'comcast': 'mx1.comcast.net',
        'verizon': 'relay.verizon.net'
      };
      
      if (knownMxMap[inferredProvider]) {
        const mxRecord = knownMxMap[inferredProvider];
        // Cache the result
        setMxCache(prev => new Map(prev.set(domain, mxRecord)));
        return mxRecord;
      }
    }

    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Reduced timeout for faster processing
      const timeout = 5000; // Reduced from 8s to 5s
      const controller = new AbortController();
      
      // Set up timeout
      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);
      
      // Handle user abort
      if (signal.aborted) {
        throw new Error('Aborted');
      }
      
      signal.addEventListener('abort', () => {
        controller.abort();
      });
      
      // Fetch MX record using DNS-over-HTTPS
      const response = await fetch(
        `https://dns.google/resolve?name=${domain}&type=MX`,
        { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        }
      );
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const responseTime = Date.now() - startTime;
      
      // Update response time stats (but less frequently to reduce re-renders)
      if (responseTime > 1000) { // Only track slow responses
        setResponseTimeStats(prev => {
          const newStats = new Map(prev);
          const current = newStats.get(domain) || [];
          current.push(responseTime);
          if (current.length > 3) current.shift(); // Reduced history size
          newStats.set(domain, current);
          return newStats;
        });
      }
      
      let mxRecord = 'No MX Record';
      
      // Check for successful DNS response
      if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
        const mxAnswers = data.Answer.filter((answer: any) => answer.type === 15);
        if (mxAnswers.length > 0) {
          // Get the MX record with lowest priority (highest preference)
          const sortedMX = mxAnswers.sort((a: any, b: any) => {
            const priorityA = parseInt(a.data.split(' ')[0]);
            const priorityB = parseInt(b.data.split(' ')[0]);
            return priorityA - priorityB;
          });
          
          const mxData = sortedMX[0].data.split(' ');
          if (mxData.length >= 2) {
            mxRecord = mxData[1].replace(/\.$/, '') || 'Invalid MX';
          }
        }
      } else if (data.Status !== 0) {
        throw new Error(`DNS query failed with status ${data.Status}`);
      }
      
      // Cache the result
      setMxCache(prev => new Map(prev.set(domain, mxRecord)));
      return mxRecord;
      
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Don't cache failures from user abort
      if (error.name === 'AbortError' && signal.aborted) {
        throw error;
      }
      
      // Use domain-based detection as fallback
      const fallbackMX = 'Lookup Failed';
      setMxCache(prev => new Map(prev.set(domain, fallbackMX)));
      return fallbackMX;
    }
  };

  // Main analysis function
  const startAnalysis = async () => {
    if (!emailInput.trim()) {
      toast.error('Please enter at least one email address or upload a file.');
      return;
    }

    const emails = extractEmails(emailInput);
    if (emails.length === 0) {
      toast.error('No valid email addresses found. Please check your input.');
      return;
    }

    // Initialize analysis state
    const domains = [...new Set(emails.map(getDomainFromEmail))];
    const totalBatches = Math.ceil(domains.length / BATCH_SIZE_OPTIMIZED);
    
    const initialAnalysisState = {
      isRunning: true,
      currentBatch: 0,
      totalBatches,
      processedDomains: [],
      pendingDomains: domains,
      currentResults: {}
    };
    
    setAnalysisState(initialAnalysisState);

    // Save email input immediately when starting analysis
    const startData = {
      emailInput,
      results: {},
      stats: { total: 0, processed: 0, unique: 0, providers: 0 },
      selectedProvider,
      progress: 0,
      progressText: 'Initializing analysis...',
      analysisState: initialAnalysisState
    };
    console.log('Saving initial analysis data:', { inputLength: emailInput.length, domainsCount: domains.length });
    saveToStorage(startData);

    setIsAnalyzing(true);
    setProgress(0);
    setProgressText('Initializing analysis...');
    setResults({});
    setStats({ total: 0, processed: 0, unique: 0, providers: 0 });

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFileName('No file chosen');

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const uniqueEmails = [...new Set(emails)];
      const domains = [...new Set(uniqueEmails.map(getDomainFromEmail))];
      const total = domains.length;
      
      setStats(prev => ({ ...prev, total, unique: uniqueEmails.length }));
      setProgressText(`Analyzing ${total} domains...`);

      const results: any = {};
      let processed = 0;

      // Preprocess domains by grouping them for faster processing
      // Group emails by domain first to avoid repeated filtering
      const emailsByDomain = new Map<string, string[]>();
      uniqueEmails.forEach(email => {
        const domain = getDomainFromEmail(email);
        if (!emailsByDomain.has(domain)) {
          emailsByDomain.set(domain, []);
        }
        emailsByDomain.get(domain)!.push(email);
      });

      // Process domains in optimized batches for better throughput
      const batchSize = BATCH_SIZE_OPTIMIZED; // Dynamic batch size based on performance
      for (let i = 0; i < domains.length; i += batchSize) {
        if (signal.aborted) break;
        
        const batch = domains.slice(i, i + batchSize);
        const batchPromises = batch.map(async (domain) => {
          try {
            const mxRecord = await getMXRecord(domain, signal);
            // Use domain-based detection if MX lookup failed
            const provider = mxRecord === 'Lookup Failed' || mxRecord === 'No MX Record' 
              ? detectProviderFromDomain(domain) 
              : detectProvider(mxRecord);
            const domainEmails = emailsByDomain.get(domain) || [];
            
            return {
              domain,
              mxRecord,
              provider,
              emails: domainEmails,
              count: domainEmails.length
            };
          } catch (error) {
            const domainEmails = emailsByDomain.get(domain) || [];
            return {
              domain,
              mxRecord: 'Lookup Failed',
              provider: detectProviderFromDomain(domain), // Use domain-based detection for errors too
              emails: domainEmails,
              count: domainEmails.length
            };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process batch results in bulk to reduce React state updates
        let batchProcessed = 0;
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const data = result.value;
            if (!results[data.mxRecord]) {
              results[data.mxRecord] = {
                mxServer: data.mxRecord,
                provider: data.provider,
                domains: [],
                emails: [],
                totalCount: 0
              };
            }
            
            results[data.mxRecord].domains.push(data.domain);
            results[data.mxRecord].emails.push(...data.emails);
            results[data.mxRecord].totalCount += data.count;
            batchProcessed++;
          }
        });
        
        // Update progress once per batch instead of per domain
        processed += batchProcessed;
        const progressPercent = Math.min((processed / total) * 100, 100);
        setProgress(progressPercent);
        setProgressText(`Processed ${processed}/${total} domains...`);
        setStats(prev => ({ ...prev, processed }));
        
        // Update results in real-time after each batch is processed (not each item)
        setResults({...results});
        
        // Update analysis state with current progress
        const currentBatch = Math.floor(i / batchSize) + 1;
        const processedDomains = domains.slice(0, processed);
        const pendingDomains = domains.slice(processed);
        
        const updatedAnalysisState = {
          isRunning: true,
          currentBatch,
          totalBatches: Math.ceil(domains.length / batchSize),
          processedDomains,
          pendingDomains,
          currentResults: {...results}
        };
        
        setAnalysisState(updatedAnalysisState);
        
        // Save progress periodically during analysis
        if (processed % 50 === 0) { // Save every 50 processed domains
          const progressData = {
            emailInput,
            results: {...results},
            stats: { total, processed, unique: uniqueEmails.length, providers: Object.keys(results).length },
            selectedProvider,
            progress: progressPercent,
            progressText: `Processed ${processed}/${total} domains...`,
            analysisState: updatedAnalysisState
          };
          saveToStorage(progressData);
        }
        
        // Small delay to allow UI updates without blocking rendering
        if (i + batchSize < domains.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (!signal.aborted) {
        setResults(results);
        const providerCount = new Set(Object.values(results).map((r: any) => r.provider)).size;
        setStats(prev => ({ ...prev, providers: providerCount }));
        setProgressText('Analysis complete!');
        toast.success(`Analysis complete! Found ${uniqueEmails.length} unique emails across ${total} domains.`);
        
        // Reset analysis state to completed
        const completedAnalysisState = {
          isRunning: false,
          currentBatch: 0,
          totalBatches: 0,
          processedDomains: [],
          pendingDomains: [],
          currentResults: {}
        };
        setAnalysisState(completedAnalysisState);

        // Immediately save completed analysis
        const finalData = {
          emailInput,
          results,
          stats: { total, processed: total, unique: uniqueEmails.length, providers: providerCount },
          selectedProvider,
          progress: 100,
          progressText: 'Analysis complete!',
          analysisState: completedAnalysisState
        };
        console.log('Saving final analysis results:', {
          resultsCount: Object.keys(results).length,
          emailCount: Object.values(results).reduce((sum: number, group: any) => sum + (group.emails?.length || 0), 0),
          providerCount,
          inputLength: emailInput.length
        });
        saveToStorage(finalData);
      }
    } catch (error: any) {
      if (error.message !== 'Aborted') {
        toast.error('Analysis failed: ' + error.message);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const stopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsAnalyzing(false);
      setProgressText('Analysis stopped by user - showing partial results');
      
      // Update stats for partial results
      if (Object.keys(results).length > 0) {
        const providerCount = new Set(Object.values(results).map((r: any) => r.provider)).size;
        setStats(prev => ({ ...prev, providers: providerCount }));
        toast.info(`Analysis stopped. Showing ${Object.keys(results).length} partial results.`);
      } else {
        toast.info('Analysis stopped.');
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setEmailInput(content);
      };
      reader.readAsText(file);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyGroupEmails = (mxKey: string) => {
    const group = results[mxKey];
    if (group) {
      const maskedEmails = applyMasking(group.emails);
      const emailText = maskedEmails.join('\n');
      copyToClipboard(emailText);
    }
  };

  const exportAllEmails = () => {
    const allEmails = Object.values(results).flatMap((group: any) => group.emails);
    const maskedEmails = applyMasking(allEmails);
    const emailText = maskedEmails.join('\n');
    copyToClipboard(emailText);
  };

  const exportByProvider = (provider: string) => {
    const providerEmails = Object.values(results)
      .filter((group: any) => group.provider === provider)
      .flatMap((group: any) => group.emails);
    const maskedEmails = applyMasking(providerEmails);
    const emailText = maskedEmails.join('\n');
    copyToClipboard(emailText);
  };

  // Advanced functions from sorter.html
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (Object.keys(results).length === 0) {
      toast.error('No results to export');
      return;
    }

    let csv = 'Provider,MX Server,Email Address,Domain\n';
    
    Object.values(results).forEach((group: any) => {
      const maskedEmails = applyMasking(group.emails);
      maskedEmails.forEach((email: string) => {
        const domain = getDomainFromEmail(email);
        csv += `"${group.provider}","${group.mxServer}","${email}","${domain}"\n`;
      });
    });

    const totalEmails = Object.values(results).reduce((sum: number, group: any) => sum + group.emails.length, 0);
    downloadFile(csv, `mx-analysis-${totalEmails}-emails.csv`, 'text/csv');
    toast.success('CSV file downloaded successfully!');
  };

  const exportJSON = () => {
    if (Object.keys(results).length === 0) {
      toast.error('No results to export');
      return;
    }

    // Group results by provider and sort by email count
    const providerGroups = new Map();
    Object.values(results).forEach((group: any) => {
      const provider = group.provider;
      if (!providerGroups.has(provider)) {
        providerGroups.set(provider, []);
      }
      providerGroups.get(provider).push(group);
    });

    // Sort providers by total email count (highest first)
    const sortedProviders = Array.from(providerGroups.entries()).sort((a, b) => {
      const countA = a[1].reduce((sum: number, group: any) => sum + group.emails.length, 0);
      const countB = b[1].reduce((sum: number, group: any) => sum + group.emails.length, 0);
      return countB - countA;
    });

    const data = {
      timestamp: new Date().toISOString(),
      summary: {
        totalEmails: Object.values(results).reduce((sum: number, group: any) => sum + group.emails.length, 0),
        uniqueDomains: stats.processed,
        uniqueMXServers: Object.keys(results).length,
        uniqueProviders: providerGroups.size,
        processingComplete: !isAnalyzing
      },
      providers: sortedProviders.map(([provider, groups]) => ({
        provider_name: provider,
        total_emails: groups.reduce((sum: number, group: any) => sum + group.emails.length, 0),
        mx_servers: groups.map((group: any) => ({
          mx_server: group.mxServer,
          email_count: group.emails.length,
          emails: applyMasking(group.emails)
        }))
      }))
    };

    downloadFile(JSON.stringify(data, null, 2), 'mx-analysis-by-provider.json', 'application/json');
    toast.success('JSON file downloaded successfully!');
  };

  const copyAllResults = async () => {
    if (Object.keys(results).length === 0) {
      toast.error('No results to copy');
      return;
    }

    // Group results by provider and sort by email count
    const providerGroups = new Map();
    Object.values(results).forEach((group: any) => {
      const provider = group.provider;
      if (!providerGroups.has(provider)) {
        providerGroups.set(provider, []);
      }
      providerGroups.get(provider).push(group);
    });

    // Sort providers by total email count (highest first)
    const sortedProviders = Array.from(providerGroups.entries()).sort((a, b) => {
      const countA = a[1].reduce((sum: number, group: any) => sum + group.emails.length, 0);
      const countB = b[1].reduce((sum: number, group: any) => sum + group.emails.length, 0);
      return countB - countA;
    });

    let text = 'MX RECORD ANALYSIS RESULTS - GROUPED BY PROVIDER\n';
    text += '='.repeat(60) + '\n\n';
    
    for (const [provider, groups] of sortedProviders) {
      const totalProviderEmails = groups.reduce((sum: number, group: any) => sum + group.emails.length, 0);
      
      text += `PROVIDER: ${provider.toUpperCase()}\n`;
      text += `Total Emails: ${totalProviderEmails}\n`;
      text += '-'.repeat(40) + '\n';
      
      for (const group of groups) {
        text += `MX Server: ${group.mxServer}\n`;
        const maskedEmails = applyMasking(group.emails);
        text += `Emails (${maskedEmails.length}):\n`;
        maskedEmails.forEach((email: string) => {
          text += `  • ${email}\n`;
        });
        text += '\n';
      }
      text += '\n';
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('All results copied to clipboard (organized by provider)!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const exportProviderCSV = (providerName: string) => {
    const providerGroups = getProviderGroups();
    const provider = providerGroups[providerName];
    if (!provider) return;

    let csv = `Provider,MX Server,Email Address,Domain\n`;
    const maskedEmails = applyMasking(provider.emails);
    maskedEmails.forEach((email: string) => {
      const domain = getDomainFromEmail(email);
      csv += `"${providerName}","Unknown","${email}","${domain}"\n`;
    });

    downloadFile(csv, `${providerName}-emails-${maskedEmails.length}.csv`, 'text/csv');
    toast.success(`${providerName} CSV exported successfully!`);
  };

  const exportProviderJSON = (providerName: string) => {
    const providerGroups = getProviderGroups();
    const provider = providerGroups[providerName];
    if (!provider) return;

    const maskedEmails = applyMasking(provider.emails);
    const data = {
      timestamp: new Date().toISOString(),
      provider: providerName,
      total_emails: maskedEmails.length,
      emails: maskedEmails
    };

    downloadFile(JSON.stringify(data, null, 2), `${providerName}-emails.json`, 'application/json');
    toast.success(`${providerName} JSON exported successfully!`);
  };

  const exportProviderTXT = (providerName: string) => {
    const providerGroups = getProviderGroups();
    const provider = providerGroups[providerName];
    if (!provider) return;

    const maskedEmails = applyMasking(provider.emails);
    const emailList = maskedEmails.join('\n');
    downloadFile(emailList, `${providerName}-emails-${maskedEmails.length}.txt`, 'text/plain');
    toast.success(`${providerName} TXT exported successfully!`);
  };

  const copyProviderEmails = async (providerName: string) => {
    const providerGroups = getProviderGroups();
    const provider = providerGroups[providerName];
    if (!provider) return;

    const maskedEmails = applyMasking(provider.emails);
    const emailList = maskedEmails.join('\n');
    
    try {
      await navigator.clipboard.writeText(emailList);
      toast.success(`Copied ${maskedEmails.length} ${providerName} emails to clipboard!`);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const checkForDuplicates = (inputText: string, extractedEmails: string[]) => {
    const lines = inputText.split('\n');
    const emailCounts = new Map();
    
    extractedEmails.forEach(email => {
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    });
    
    const duplicates = Array.from(emailCounts.entries()).filter(([_, count]) => count > 1);
    
    if (duplicates.length > 0) {
      const totalDuplicates = duplicates.reduce((sum, [_, count]) => sum + count - 1, 0);
      toast.warning(`Found ${totalDuplicates} duplicate emails in ${duplicates.length} unique addresses`);
    }
  };

  const cleanDuplicates = () => {
    const emails = extractEmails(emailInput);
    const uniqueEmails = [...new Set(emails)];
    const removedCount = emails.length - uniqueEmails.length;
    
    if (removedCount > 0) {
      setEmailInput(uniqueEmails.join('\n'));
      toast.success(`Removed ${removedCount} duplicate emails`);
    } else {
      toast.info('No duplicates found');
    }
  };

  // Memoized provider groups for performance
  const getProviderGroups = useMemo(() => {
    const providers: any = {};
    Object.values(results).forEach((group: any) => {
      if (!providers[group.provider]) {
        providers[group.provider] = {
          provider: group.provider,
          emails: [],
          count: 0
        };
      }
      providers[group.provider].emails.push(...group.emails);
      providers[group.provider].count += group.totalCount;
    });
    return providers;
  }, [results]);

  // Memoized filtered results for performance
  const getFilteredResults = useMemo(() => {
    if (selectedProvider === "all") {
      return results;
    }
    
    const filtered: any = {};
    Object.entries(results).forEach(([mxKey, group]: [string, any]) => {
      if (group.provider === selectedProvider) {
        filtered[mxKey] = group;
      }
    });
    return filtered;
  }, [results, selectedProvider]);

  // Memoized filtered provider groups for performance
  const getFilteredProviderGroups = useMemo(() => {
    if (selectedProvider === "all") {
      return getProviderGroups;
    }
    
    const filtered: any = {};
    if (getProviderGroups[selectedProvider]) {
      filtered[selectedProvider] = getProviderGroups[selectedProvider];
    }
    return filtered;
  }, [getProviderGroups, selectedProvider]);

  // Memoized available providers list for performance
  const getAvailableProviders = useMemo(() => {
    const providers = new Set<string>();
    Object.values(results).forEach((group: any) => {
      providers.add(group.provider);
    });
    return Array.from(providers).sort();
  }, [results]);

  // Clear all data and storage
  const clearAllData = () => {
    setEmailInput('');
    setResults({});
    setStats({ total: 0, processed: 0, unique: 0, providers: 0 });
    setProgress(0);
    setProgressText('');
    setSelectedProvider('all');
    setIsAnalyzing(false);
    setShowRestoredNotification(false);
    clearStorage();
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFileName('No file chosen');
    
    toast.success('All data cleared successfully!');
  };

  // Helper function to return emails unchanged (no masking on sorter page)
  const applyMasking = (emails: string[]): string[] => {
    return emails;
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Email Sorter</h2>
          <p className="text-muted-foreground">
            Analyze and sort email addresses by MX records and providers
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(results).length > 0 || emailInput.trim()) && (
            <Button
              variant="outline"
              onClick={clearAllData}
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Restored Data Notification */}
      {showRestoredNotification && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-green-800">
                {analysisState.isRunning && analysisState.pendingDomains.length > 0 
                  ? 'Interrupted Analysis Detected' 
                  : 'Previous Session Restored'}
              </h4>
              <p className="text-sm text-green-700">
                {analysisState.isRunning && analysisState.pendingDomains.length > 0 
                  ? `Analysis was interrupted with ${analysisState.pendingDomains.length} domains remaining. You can resume where you left off or start over.`
                  : 'Your email analysis from a previous session has been automatically restored.'}
              </p>
            </div>
            <div className="flex gap-2">
              {analysisState.isRunning && analysisState.pendingDomains.length > 0 && (
                <Button
                  onClick={() => {
                    const restored = loadFromStorage();
                    if (restored) {
                      resumeAnalysis(restored);
                      setShowRestoredNotification(false);
                    }
                  }}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume Analysis
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRestoredNotification(false)}
                className="text-green-600 hover:text-green-800"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Input
            </CardTitle>
            <CardDescription>
              Enter email addresses or upload a file for analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Addresses</label>
              <Textarea
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter email addresses (one per line or separated by commas, spaces, etc.)\n\nExample:\njohn@gmail.com\nsarah@company.com\nmarketing@startup.io"
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports various formats: line-separated, comma-separated, or space-separated
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Or Upload File</label>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
                <span className="text-sm text-muted-foreground">{fileName}</span>
              </div>
            </div>

            {/* Duplicate Detection Section */}
            {showDuplicates && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">
                      Found {duplicateCount} duplicate email{duplicateCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cleanDuplicates}
                    className="text-yellow-700 border-yellow-300 hover:bg-yellow-100"
                  >
                    Remove Duplicates
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={startAnalysis}
                disabled={isAnalyzing}
                className="flex-1"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Analysis
                  </>
                )}
              </Button>
              {isAnalyzing && (
                <Button
                  onClick={stopAnalysis}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              )}
            </div>

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{progressText}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analysis Results
            </CardTitle>
            <CardDescription>
              Real-time email sorting and MX record analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.total > 0 && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm opacity-90">Total Domains</div>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.processed}</div>
                  <div className="text-sm opacity-90">Processed</div>
                </div>
                <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.unique}</div>
                  <div className="text-sm opacity-90">Unique Emails</div>
                </div>
                <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.providers}</div>
                  <div className="text-sm opacity-90">Providers</div>
                </div>
              </div>
            )}

            {/* Always show the results section, even if empty */}
            {(
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {isAnalyzing ? "Sorted Results so far" : "Sorted Results"}
                  </h3>
                  <div className="flex gap-2">
                    {Object.keys(results).length > 0 && (
                      <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                        <SelectTrigger className="w-48">
                          <Filter className="mr-2 h-4 w-4" />
                          <SelectValue placeholder="Filter by provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Providers ({getAvailableProviders.length})</SelectItem>
                          {getAvailableProviders.map((provider) => (
                            <SelectItem key={provider} value={provider}>
                              {provider} ({getProviderGroups[provider]?.count || 0})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allEmails = Object.values(results).flatMap((group: any) => group.emails);
                        const maskedEmails = applyMasking(allEmails);
                        const emailText = maskedEmails.join('\n');
                        downloadFile(emailText, `sorted-emails-${maskedEmails.length}.txt`, 'text/plain');
                        toast.success('TXT file downloaded successfully!');
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Download TXT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportAllEmails}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy All
                    </Button>
                  </div>
                </div>

                <Tabs value={activeExportTab} onValueChange={setActiveExportTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="provider">By Provider</TabsTrigger>
                    <TabsTrigger value="all">By MX Server</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="all" className="space-y-3">
                    {Object.keys(getFilteredResults).length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        {Object.keys(results).length === 0 ? (
                          isAnalyzing ? 
                            "Analysis in progress... Results will appear here as they're processed." : 
                            "No results yet. Start analysis to see results here."
                        ) : (
                          `No results found for ${selectedProvider} provider.`
                        )}
                      </div>
                    ) : (
                      Object.entries(getFilteredResults).map(([mxKey, group]: [string, any]) => (
                        <div key={mxKey} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-lg flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                {group.mxServer}
                              </div>
                              <Badge variant="secondary" className="mt-1">
                                {group.provider}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-blue-600">
                                {group.totalCount}
                              </div>
                              <div className="text-sm text-muted-foreground">emails</div>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Domains: {group.domains.join(', ')}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyGroupEmails(mxKey)}
                            className="w-full"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy {group.totalCount} Emails
                          </Button>
                        </div>
                      ))
                    )}
                  </TabsContent>
                  
                  <TabsContent value="provider" className="space-y-3">
                    {Object.keys(getFilteredProviderGroups).length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        {Object.keys(results).length === 0 ? (
                          isAnalyzing ? 
                            "Analysis in progress... Results will appear here as they're processed." : 
                            "No results yet. Start analysis to see results here."
                        ) : (
                          `No results found for ${selectedProvider} provider.`
                        )}
                      </div>
                    ) : (
                      Object.entries(getFilteredProviderGroups).map(([provider, group]: [string, any]) => (
                      <div key={provider} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-lg">{provider}</div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-600">
                              {group.count}
                            </div>
                            <div className="text-sm text-muted-foreground">emails</div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportByProvider(provider)}
                          className="w-full"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy {provider} Emails
                        </Button>
                      </div>
                    ))
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {Object.keys(results).length === 0 && stats.total === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No analysis results yet.</p>
                <p className="text-sm">Enter email addresses and start analysis to see results.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Sorter;