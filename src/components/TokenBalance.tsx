import { useState, useEffect } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface TokenBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
}

export function TokenBalance() {
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const fetchTokenBalance = async () => {
    try {
      setIsLoading(true);
      
      // Use the same auth method as the API library
      const headers = await getAuthHeaders();
      
      console.log('Fetching token balance from:', `${API_BASE_URL}/tokens/balance`);
      console.log('Headers:', headers);
      
      const response = await fetch(`${API_BASE_URL}/tokens/balance`, { headers });
      
      console.log('Token balance response status:', response.status);
      
      const data = await response.json();
      console.log('Token balance response data:', data);
      
      if (data.success) {
        setTokenBalance(data.tokenBalance);
      } else {
        console.error('Token balance API error:', data.error);
        // If token system not set up yet, show default balance
        if (data.error?.includes('relation') || data.error?.includes('does not exist')) {
          setTokenBalance({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
          toast.error('Token system not yet configured. Please run the database migration.');
        }
      }
    } catch (error) {
      console.error('Error fetching token balance:', error);
      // Show default balance on error
      setTokenBalance({ balance: 0, totalPurchased: 0, totalConsumed: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenBalance();

    // Refresh balance every 30 seconds (fallback)
    const interval = setInterval(fetchTokenBalance, 30000);

    // Set up real-time subscription for instant balance updates
    let subscription: any = null;

    const setupRealtimeSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const channelName = `token-balance-${user.id}`;

          subscription = supabase
            .channel(channelName)
            .on('broadcast', { event: 'balance-update' }, (payload) => {
              console.log('Received real-time token balance update:', payload);

              // Update the balance immediately
              setTokenBalance(prev => prev ? {
                ...prev,
                balance: payload.payload.newBalance
              } : null);

              // Show toast notification
              toast.success(`Tokens updated: -${payload.payload.tokensDeducted} (${payload.payload.action})`);
            })
            .subscribe();
        }
      } catch (error) {
        console.error('Error setting up real-time token balance subscription:', error);
      }
    };

    setupRealtimeSubscription();

    return () => {
      clearInterval(interval);
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const handleBuyTokens = () => {
    navigate('/billing');
  };

  const getBalanceColor = (balance: number) => {
    if (balance < 10) return 'bg-red-500 hover:bg-red-600';
    if (balance < 50) return 'bg-orange-500 hover:bg-orange-600';
    return 'bg-green-500 hover:bg-green-600';
  };

  const getBalanceText = (balance: number) => {
    if (balance < 10) return 'Low Balance';
    if (balance < 50) return 'Running Low';
    return 'Good Balance';
  };

  const getBalanceTextColor = (balance: number) => {
    if (balance < 10) return 'text-red-600';
    if (balance < 50) return 'text-orange-600';
    return 'text-green-600';
  };

  if (!tokenBalance && isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled className="px-3 py-2">
        <span className="text-sm font-medium text-muted-foreground">Credit Balance:</span>
        <span className="text-sm font-bold text-gray-400">Loading...</span>
      </Button>
    );
  }

  // Show default if no balance loaded
  if (!tokenBalance) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBuyTokens}
        className="flex items-center gap-2 hover:bg-accent px-3 py-2"
        title="Token balance unavailable - Click to set up tokens"
      >
        <span className="text-sm font-medium text-muted-foreground">Credit Balance:</span>
        <span className="text-sm font-bold text-gray-400">--</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBuyTokens}
      className="flex items-center gap-2 hover:bg-accent px-3 py-2"
      title={`${getBalanceText(tokenBalance.balance)} - Click to buy more tokens`}
    >
      <span className="text-sm font-medium text-muted-foreground">Credit Balance:</span>
      <span className={`font-bold ${getBalanceTextColor(tokenBalance.balance)}`} style={{ fontSize: '18px' }}>
        ₡{tokenBalance.balance.toLocaleString()}
      </span>
    </Button>
  );
}