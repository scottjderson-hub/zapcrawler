import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Shield, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Office365Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expirationDate?: number;
  httpOnly?: boolean;
  hostOnly?: boolean;
}

interface Office365CookieModalProps {
  onAddAccount: (email: string, cookies: Office365Cookie[], proxyId?: string) => Promise<void>;
  onTestProxy?: (proxyId: string) => void;
  proxies?: any[];
  testingProxyId?: string | null;
  isLoading?: boolean;
}

export function Office365CookieModal({
  onAddAccount,
  onTestProxy,
  proxies = [],
  testingProxyId = null,
  isLoading = false
}: Office365CookieModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [cookiesJson, setCookiesJson] = useState('');
  const [proxyId, setProxyId] = useState('no-proxy');
  const [validationError, setValidationError] = useState('');

  const validateCookies = (cookiesString: string): { valid: boolean; cookies?: Office365Cookie[]; error?: string } => {
    try {
      const cookies = JSON.parse(cookiesString);

      if (!Array.isArray(cookies)) {
        return { valid: false, error: 'Cookies must be an array' };
      }

      if (cookies.length === 0) {
        return { valid: false, error: 'Cookies array cannot be empty' };
      }

      // Check required cookies
      const requiredCookies = ['ESTSAUTH', 'ESTSAUTHPERSISTENT'];
      const cookieNames = cookies.map((c: any) => c.name);

      for (const required of requiredCookies) {
        if (!cookieNames.includes(required)) {
          return { valid: false, error: `Missing required cookie: ${required}` };
        }
      }

      // Validate cookie structure
      for (const cookie of cookies) {
        if (!cookie.name || !cookie.value || !cookie.domain) {
          return { valid: false, error: 'Invalid cookie structure - missing name, value, or domain' };
        }
      }

      return { valid: true, cookies };
    } catch (error) {
      return { valid: false, error: 'Invalid JSON format' };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!email) {
      setValidationError('Email is required');
      return;
    }

    if (proxyId === 'no-proxy') {
      setValidationError('Proxy selection is required for secure Office365 cookie authentication');
      return;
    }

    if (!cookiesJson) {
      setValidationError('Cookies are required');
      return;
    }

    const validation = validateCookies(cookiesJson);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid cookies');
      return;
    }

    try {
      const finalProxyId = proxyId !== 'no-proxy' ? proxyId : undefined;
      await onAddAccount(email, validation.cookies!, finalProxyId);
      setIsOpen(false);
      setEmail('');
      setCookiesJson('');
      setProxyId('no-proxy');
      setValidationError('');
      toast.success('Office365 account added successfully!');
    } catch (error: any) {
      setValidationError(error.message || 'Failed to add account');
    }
  };

  const handleCookiesChange = (value: string) => {
    setCookiesJson(value);
    setValidationError('');
  };

  const exampleCookies = `[
  {
    "name": "ESTSAUTH",
    "value": "your_estsauth_value_here",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "httpOnly": true
  },
  {
    "name": "ESTSAUTHPERSISTENT",
    "value": "your_estsauthpersistent_value_here",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "httpOnly": true
  },
  {
    "name": "SignInStateCookie",
    "value": "your_signin_state_value_here",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "httpOnly": true
  }
]`;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Shield className="h-4 w-4 mr-2" />
          Office365 (Cookies)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Add Office365 Account (Cookie-based)
          </DialogTitle>
          <DialogDescription>
            Add your Office365/Outlook account using browser cookies for authentication.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>How to get cookies:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
              <li>Login to your Office365/Outlook account in your browser</li>
              <li>Open browser Developer Tools (F12)</li>
              <li>Go to Application/Storage tab → Cookies → login.microsoftonline.com</li>
              <li>Copy ESTSAUTH, ESTSAUTHPERSISTENT, and SignInStateCookie values</li>
              <li>Format as JSON array and paste below</li>
            </ol>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Office365 Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="proxy">Proxy (Required for secure connection)</Label>
            <div className="flex gap-2">
              <Select value={proxyId} onValueChange={setProxyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a proxy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-proxy">No Proxy</SelectItem>
                  {proxies.map((proxy: any) => (
                    <SelectItem key={proxy.id || proxy._id} value={proxy.id || proxy._id}>
                      {proxy.host}:{proxy.port} ({proxy.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {proxyId !== "no-proxy" && onTestProxy && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onTestProxy(proxyId)}
                  disabled={testingProxyId === proxyId}
                  className="flex-shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${testingProxyId === proxyId ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select a proxy server to route your Office365 connection through for anonymity and security.
            </p>
          </div>

          <div>
            <Label htmlFor="cookies">Cookies (JSON format)</Label>
            <Textarea
              id="cookies"
              value={cookiesJson}
              onChange={(e) => handleCookiesChange(e.target.value)}
              placeholder={exampleCookies}
              className="min-h-[300px] font-mono text-xs"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste your cookies in JSON format. Must include ESTSAUTH and ESTSAUTHPERSISTENT.
            </p>
          </div>

          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding Account...
                </>
              ) : (
                'Add Account'
              )}
            </Button>
          </div>
        </form>

        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Security Note:</strong> Cookies are encrypted and stored securely.
            They are only used to authenticate with Microsoft's servers. Never share your cookies with untrusted sources.
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
}