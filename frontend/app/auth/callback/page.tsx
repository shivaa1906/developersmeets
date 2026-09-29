'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Terminal, Loader2, AlertCircle } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login: setAuthSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = searchParams.get('token');
    const redirect = searchParams.get('redirect') || '/dashboard';
    const err = searchParams.get('error');

    if (err) {
      router.replace(`/login?error=${encodeURIComponent(err)}`);
      return;
    }

    if (!token) {
      router.replace('/login?error=invalid_token');
      return;
    }

    const completeSession = async () => {
      try {
        localStorage.setItem('nexus_auth_token', token);
        localStorage.setItem('token', token);

        const res = await apiClient.get<{ user: any }>('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.user) {
          setAuthSession(token, res.user);
          router.replace(redirect);
        } else {
          throw new Error('Profile fetch failed');
        }
      } catch (_e) {
        setError('Failed to establish authenticated session.');
        router.replace('/login?error=session_failed');
      }
    };

    completeSession();
  }, [searchParams, router, setAuthSession]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="flex flex-col items-center space-y-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent shadow-accent-glow animate-pulse">
          <Terminal className="h-6 w-6" />
        </div>
        {error ? (
          <div className="flex items-center space-x-2 text-status-danger text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center space-x-2 text-foreground font-semibold text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span>Completing Google Authentication...</span>
            </div>
            <p className="text-xs text-muted">Securing your session token and initializing workspace.</p>
          </div>
        )}
      </div>
    </div>
  );
}
