import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MicrosoftOAuthConnectProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tokenData: any) => void;
  email?: string;
}

interface OAuthResponse {
  success: boolean;
  authUrl?: string;
  state?: string;
  message: string;
}

export function MicrosoftOAuthConnect({ 
  isOpen, 
  onClose, 
  onSuccess, 
  email: initialEmail = "" 
}: MicrosoftOAuthConnectProps) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'initiating' | 'waiting' | 'success' | 'error'>('idle');
  const [authUrl, setAuthUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const handleInitiateOAuth = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setStatus('initiating');
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/microsoft/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data: OAuthResponse = await response.json();

      if (data.success && data.authUrl) {
        setAuthUrl(data.authUrl);
        setStatus('waiting');
        
        // Open authorization URL in new window
        const authWindow = window.open(
          data.authUrl,
          'microsoft-oauth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Start polling for completion
        startPollingForCompletion(data.state || '', authWindow);
        
        toast.success('Authorization window opened. Please complete the login process.');
      } else {
        throw new Error(data.message || 'Failed to initiate OAuth');
      }
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || 'Failed to initiate OAuth process');
      toast.error(`OAuth initiation failed: ${error.message}`);
    }
  };

  const startPollingForCompletion = (state: string, authWindow: Window | null) => {
    const interval = setInterval(async () => {
      try {
        // Poll backend to check if OAuth was completed
        const response = await fetch(`/api/auth/microsoft/status?state=${encodeURIComponent(state)}`);
        const statusData = await response.json();

        if (statusData.success && statusData.completed && statusData.tokens) {
          // OAuth completed successfully
          clearInterval(interval);
          setPollInterval(null);
          setStatus('success');

          // Try to close the popup window (may fail due to COOP, but that's OK)
          try {
            if (authWindow) {
              authWindow.close();
            }
          } catch (e) {
            // Ignore COOP errors - user can close popup manually
            console.log('Could not close popup automatically due to COOP policy');
          }

          onSuccess({
            email: statusData.tokens.email,
            accessToken: statusData.tokens.accessToken,
            refreshToken: statusData.tokens.refreshToken,
            expiresOn: statusData.tokens.expiresOn,
            authMethod: 'oauth2'
          });

          toast.success('OAuth2 authentication successful! You can close the popup window.');
          return;
        }

      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    setPollInterval(interval);

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPollInterval(null);

      // Try to close the popup window (may fail due to COOP, but that's OK)
      try {
        if (authWindow) {
          authWindow.close();
        }
      } catch (e) {
        // Ignore COOP errors
        console.log('Could not close popup automatically due to COOP policy');
      }

      setStatus('error');
      setErrorMessage('OAuth process timed out. Please try again.');
      toast.error('OAuth process timed out. Please try again.');
    }, 10 * 60 * 1000);
  };

  const handleManualCallback = async (callbackUrl: string) => {
    try {
      const url = new URL(callbackUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        throw new Error(url.searchParams.get('error_description') || error);
      }

      if (code && state) {
        setStatus('success');

        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }

        // Exchange authorization code for access token
        const response = await fetch(`/api/auth/microsoft/callback?code=${code}&state=${state}`, {
          method: 'GET'
        });

        const tokenData = await response.json();

        if (tokenData.success && tokenData.tokens) {
          onSuccess({
            email: tokenData.tokens.email,
            accessToken: tokenData.tokens.accessToken,
            refreshToken: tokenData.tokens.refreshToken,
            expiresOn: tokenData.tokens.expiresOn,
            authMethod: 'oauth2'
          });

          toast.success('OAuth2 authentication successful!');
        } else {
          throw new Error(tokenData.message || 'Failed to exchange authorization code for tokens');
        }
      } else {
        throw new Error('Invalid callback URL - missing code or state');
      }
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message);
      toast.error(`Invalid callback URL: ${error.message}`);
    }
  };

  const handleClose = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setStatus('idle');
    setAuthUrl('');
    setErrorMessage('');
    onClose();
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'initiating':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'waiting':
        return <ExternalLink className="h-5 w-5 text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'initiating':
        return 'Setting up secure authentication...';
      case 'waiting':
        return 'Waiting for you to complete authentication in the popup window';
      case 'success':
        return 'Authentication successful!';
      case 'error':
        return errorMessage;
      default:
        return 'Connect your Microsoft account securely using OAuth2';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Microsoft OAuth2 Authentication
          </DialogTitle>
          <DialogDescription>
            Connect your Outlook/Office365 account securely without sharing your password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="oauth-email">Email Address</Label>
            <Input
              id="oauth-email"
              type="email"
              placeholder="your.email@outlook.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status !== 'idle'}
            />
          </div>

          {/* Status Display */}
          <Alert>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <AlertDescription>{getStatusMessage()}</AlertDescription>
            </div>
          </Alert>

          {/* Authorization URL Display */}
          {authUrl && status === 'waiting' && (
            <div className="space-y-2">
              <Label>If the popup didn't open, click here:</Label>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(authUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Authorization Page
              </Button>
            </div>
          )}

          {/* Manual Callback (for development/testing) */}
          {status === 'waiting' && (
            <div className="space-y-2">
              <Label htmlFor="callback-url">Or paste the callback URL here:</Label>
              <div className="flex gap-2">
                <Input
                  id="callback-url"
                  placeholder="http://localhost:3001/api/auth/microsoft/callback?code=..."
                  onChange={(e) => {
                    if (e.target.value.includes('code=')) {
                      handleManualCallback(e.target.value);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            {status === 'idle' && (
              <Button
                onClick={handleInitiateOAuth}
                disabled={!email}
                className="flex-1"
              >
                <Shield className="h-4 w-4 mr-2" />
                Connect with OAuth2
              </Button>
            )}
            
            {status === 'waiting' && (
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
            )}

            {(status === 'success' || status === 'error') && (
              <Button onClick={handleClose} className="flex-1">
                Close
              </Button>
            )}
          </div>

          {/* Security Notice */}
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
            <strong>🔒 Secure Authentication:</strong> OAuth2 lets you connect your account 
            without sharing your password. Microsoft will redirect you back after authorization.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}