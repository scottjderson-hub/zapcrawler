import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, Users, Zap, CreditCard, Smartphone, Coins } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';

interface TokenPackage {
  id: string;
  name: string;
  cubes: number;
  priceUsd: number;
  bonusPercentage: number;
  popular?: boolean;
}

interface UserTokenBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  recentTransactions: any[];
}

// Token package icons mapping
const packageIcons: Record<string, any> = {
  starter: Users,
  basic: Users,
  standard: Zap,
  premium: Zap,
  professional: Crown,
  business: Crown,
  enterprise: Crown,
  ultimate: Crown,
};

const paymentMethods = [
  { name: 'Bitcoin', symbol: 'BTC', icon: '₿' },
  { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ' },
  { name: 'Litecoin', symbol: 'LTC', icon: 'Ł' },
  { name: 'Dogecoin', symbol: 'DOGE', icon: 'Ð' },
  { name: 'USDT', symbol: 'USDT', icon: '₮' },
  { name: 'USDC', symbol: 'USDC', icon: '$' },
];

export default function Billing() {
  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [tokenBalance, setTokenBalance] = useState<UserTokenBalance | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTokenData();
  }, []);

  const fetchTokenData = async () => {
    try {
      const headers = await getAuthHeaders();

      // Fetch token packages
      const packagesResponse = await fetch(`${API_BASE_URL}/tokens/packages`, { headers });
      const packagesData = await packagesResponse.json();
      
      if (packagesData.success) {
        setTokenPackages(packagesData.packages);
      }

      // Fetch user token balance
      const balanceResponse = await fetch(`${API_BASE_URL}/tokens/balance`, { headers });
      const balanceData = await balanceResponse.json();
      
      if (balanceData.success) {
        setTokenBalance(balanceData.tokenBalance);
      }
    } catch (error) {
      console.error('Error fetching token data:', error);
      toast.error('Failed to load token information');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = (packageId: string) => {
    setSelectedPackage(packageId);
    setShowPayment(true);
  };

  const handlePayment = async () => {
    if (!selectedPaymentMethod || !selectedPackage) return;
    
    try {
      const headers = await getAuthHeaders();

      // TODO: Integrate with nowpayments.io
      const response = await fetch(`${API_BASE_URL}/tokens/purchase`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage,
          currency: selectedPaymentMethod,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Purchase initiated! You will receive tokens once payment is confirmed.');
        setShowPayment(false);
        await fetchTokenData(); // Refresh token balance
      } else {
        toast.error(data.error || 'Failed to initiate purchase');
      }
    } catch (error) {
      toast.error('Payment failed. Please try again.');
      console.error('Payment error:', error);
    }
  };

  const selectedPackageData = tokenPackages.find(pkg => pkg.id === selectedPackage);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Coins className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading token packages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Buy ZapCrawler Tokens</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Pay only for what you use. Purchase tokens with cryptocurrency and start crawling emails immediately.
          1 token = 1 email fetch, 5 tokens = 1 connection test.
        </p>
      </div>

      {/* Current Balance */}
      {tokenBalance && (
        <Alert className="max-w-4xl mx-auto">
          <Coins className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                Current Balance: <strong>{tokenBalance.balance.toLocaleString()} tokens</strong>
              </span>
              <div className="text-sm text-muted-foreground">
                Total Purchased: {tokenBalance.totalPurchased.toLocaleString()} | 
                Total Used: {tokenBalance.totalConsumed.toLocaleString()}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Methods Info */}
      <div className="text-center space-y-4">
        <h3 className="text-lg font-semibold">Accepted Payment Methods</h3>
        <div className="flex justify-center items-center gap-4 flex-wrap">
          {paymentMethods.map((method) => (
            <div key={method.symbol} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
              <span className="text-lg font-bold">{method.icon}</span>
              <span className="text-sm font-medium">{method.name}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Powered by NOWPayments - Secure cryptocurrency payments
        </p>
      </div>

      {/* Token Packages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {tokenPackages.map((pkg) => {
          const Icon = packageIcons[pkg.id] || Coins;
          const baseTokens = Math.floor(pkg.cubes / (1 + pkg.bonusPercentage / 100));
          const bonusTokens = pkg.cubes - baseTokens;
          
          return (
            <Card key={pkg.id} className={`relative ${pkg.popular ? 'border-primary shadow-lg' : ''}`}>
              {pkg.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                
                <div>
                  <CardTitle className="text-xl">{pkg.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {pkg.cubes.toLocaleString()} tokens
                  </CardDescription>
                </div>
                
                <div className="space-y-1">
                  <div className="text-3xl font-bold">
                    ${pkg.priceUsd}
                  </div>
                  {pkg.bonusPercentage > 0 && (
                    <div className="text-sm text-green-600 font-medium">
                      +{pkg.bonusPercentage}% Bonus ({bonusTokens.toLocaleString()} free tokens)
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Base tokens:</span>
                    <span>{baseTokens.toLocaleString()}</span>
                  </div>
                  {pkg.bonusPercentage > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>Bonus tokens:</span>
                      <span>+{bonusTokens.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-medium border-t pt-2">
                    <span>Total tokens:</span>
                    <span>{pkg.cubes.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    • {Math.floor(pkg.cubes / 5).toLocaleString()} connection tests<br/>
                    • {pkg.cubes.toLocaleString()} email fetches<br/>
                    • Tokens never expire
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => handlePurchase(pkg.id)}
                >
                  Buy {pkg.name} Package
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Payment Modal */}
      {showPayment && selectedPackageData && (
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Complete Payment
            </CardTitle>
            <CardDescription>
              Purchasing {selectedPackageData.name} Token Package
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-2xl font-bold">${selectedPackageData.priceUsd}</div>
              <div className="text-sm text-muted-foreground">
                {selectedPackageData.cubes.toLocaleString()} tokens
              </div>
              {selectedPackageData.bonusPercentage > 0 && (
                <div className="text-sm text-green-600 font-medium">
                  +{selectedPackageData.bonusPercentage}% Bonus Included
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Select Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.slice(0, 4).map((method) => (
                  <Button
                    key={method.symbol}
                    variant={selectedPaymentMethod === method.symbol ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPaymentMethod(method.symbol)}
                    className="justify-start"
                  >
                    <span className="mr-2">{method.icon}</span>
                    {method.symbol}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowPayment(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handlePayment}
                disabled={!selectedPaymentMethod}
              >
                Pay Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}