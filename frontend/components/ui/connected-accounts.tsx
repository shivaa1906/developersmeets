'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';

export interface ProviderStatus {
  connected: boolean;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
  canDisconnect: boolean;
}

export interface ConnectedAccountsData {
  hasPassword: boolean;
  authMethodsCount: number;
  providers: {
    google: ProviderStatus;
    facebook: ProviderStatus;
    discord: ProviderStatus;
  };
}

function ConnectedAccountsInner() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const [data, setData] = React.useState<ConnectedAccountsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionProvider, setActionProvider] = React.useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState<{
    provider: 'google' | 'facebook' | 'discord';
    title: string;
  } | null>(null);

  // Check URL search parameters for OAuth callback results
  React.useEffect(() => {
    const linked = searchParams?.get('linked');
    const alreadyLinked = searchParams?.get('already_linked');
    const error = searchParams?.get('error');

    if (linked) {
      const providerName = linked.charAt(0).toUpperCase() + linked.slice(1);
      addToast('success', 'Account Connected', `${providerName} has been connected to your account.`);
    } else if (alreadyLinked) {
      const providerName = alreadyLinked.charAt(0).toUpperCase() + alreadyLinked.slice(1);
      addToast('info', 'Already Connected', `${providerName} is already connected to this account.`);
    } else if (error) {
      addToast('error', 'Connection Failed', error);
    }
  }, [searchParams, addToast]);

  const loadAccounts = React.useCallback(async () => {
    try {
      const res = await api.get<ConnectedAccountsData>('/auth/account/connected-providers');
      setData(res);
    } catch (_err) {
      // Fallback state if unauthenticated or offline
      setData({
        hasPassword: true,
        authMethodsCount: 1,
        providers: {
          google: { connected: false, email: null, displayName: null, connectedAt: null, canDisconnect: false },
          facebook: { connected: false, email: null, displayName: null, connectedAt: null, canDisconnect: false },
          discord: { connected: false, email: null, displayName: null, connectedAt: null, canDisconnect: false },
        },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleConnect = async (provider: 'google' | 'facebook' | 'discord') => {
    setActionProvider(provider);
    try {
      const returnUrl = window.location.pathname;
      const res = await api.post<{ authorizationUrl: string; state: string }>(
        `/auth/account/link/${provider}`,
        { returnUrl }
      );
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch (err: any) {
      addToast('error', 'Connection Error', err.message || `Failed to initiate ${provider} connection.`);
      setActionProvider(null);
    }
  };

  const handleDisconnect = async (provider: 'google' | 'facebook' | 'discord') => {
    if (!data?.providers[provider]?.canDisconnect) {
      const title = provider.charAt(0).toUpperCase() + provider.slice(1);
      addToast(
        'error',
        'Cannot Disconnect',
        `You must add another secure sign-in method before disconnecting ${title}.`
      );
      setConfirmDisconnect(null);
      return;
    }

    setActionProvider(provider);
    try {
      await api.post(`/auth/account/unlink/${provider}`);
      const title = provider.charAt(0).toUpperCase() + provider.slice(1);
      addToast('success', 'Disconnected', `${title} was successfully disconnected from your account.`);
      await loadAccounts();
    } catch (err: any) {
      addToast('error', 'Disconnection Error', err.message || `Failed to disconnect ${provider}.`);
    } finally {
      setActionProvider(null);
      setConfirmDisconnect(null);
    }
  };

  const providersConfig = [
    {
      id: 'google' as const,
      name: 'Google',
      description: 'Sign in seamlessly with your verified Google account.',
      badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'facebook' as const,
      name: 'Facebook',
      description: 'Connect your Facebook identity for quick platform access.',
      badgeColor: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    },
    {
      id: 'discord' as const,
      name: 'Discord',
      description: 'Authenticate with your Discord developer or community profile.',
      badgeColor: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10',
    },
  ];

  return (
    <Card className="border border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Connected Accounts</CardTitle>
            <CardDescription className="text-xs text-muted mt-0.5">
              Manage your linked authentication identities. At least one secure sign-in method is always required.
            </CardDescription>
          </div>
          {data && (
            <Badge variant="outline" className="text-xs font-mono">
              {data.authMethodsCount} Active {data.authMethodsCount === 1 ? 'Method' : 'Methods'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Password Authentication Status */}
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-foreground">Account Password</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono ${
                  data?.hasPassword
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                    : 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                }`}
              >
                {data?.hasPassword ? 'Configured' : 'Not Set'}
              </Badge>
            </div>
            <p className="text-xs text-muted">
              {data?.hasPassword
                ? 'Standard email and password authentication is active.'
                : 'No password set. Add a password to sign in without OAuth providers.'}
            </p>
          </div>
        </div>

        {/* OAuth Providers */}
        {providersConfig.map((item) => {
          const providerInfo = data?.providers[item.id];
          const isConnected = providerInfo?.connected ?? false;
          const isProcessing = actionProvider === item.id;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20"
            >
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-mono ${
                      isConnected
                        ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                        : 'border-muted text-muted bg-muted/10'
                    }`}
                  >
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  {isConnected && providerInfo?.email
                    ? `Connected as ${providerInfo.email}`
                    : item.description}
                </p>
              </div>

              <div>
                {isConnected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
                    isLoading={isProcessing}
                    onClick={() =>
                      setConfirmDisconnect({
                        provider: item.id,
                        title: item.name,
                      })
                    }
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    isLoading={isProcessing}
                    onClick={() => handleConnect(item.id)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Safe Disconnect Confirmation Dialog */}
        {confirmDisconnect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                Disconnect {confirmDisconnect.title}?
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                Are you sure you want to disconnect {confirmDisconnect.title}? You will need to use your other
                configured authentication method(s) to sign in to this account.
              </p>
              {data && data.authMethodsCount <= 1 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                  ⚠️ This is currently your only sign-in method. You must set a password or connect another provider
                  before disconnecting.
                </div>
              )}
              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDisconnect(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={data ? !data.providers[confirmDisconnect.provider]?.canDisconnect : false}
                  onClick={() => handleDisconnect(confirmDisconnect.provider)}
                  isLoading={actionProvider === confirmDisconnect.provider}
                >
                  Confirm Disconnect
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConnectedAccountsCard() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-muted">Loading connected accounts...</div>}>
      <ConnectedAccountsInner />
    </React.Suspense>
  );
}
