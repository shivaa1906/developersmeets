'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Terminal, Loader2, AlertCircle } from 'lucide-react';

function getSafeRedirect(path: string | null | undefined): string | null {
  if (!path) return null;
  const decoded = decodeURIComponent(path.trim());
  if (
    decoded.startsWith('/') &&
    !decoded.startsWith('//') &&
    !decoded.startsWith('/\\') &&
    !decoded.includes(':')
  ) {
    return decoded;
  }
  return null;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login: setAuthSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = searchParams.get('token');
    const returnUrlParam = searchParams.get('returnUrl') || searchParams.get('redirect') || searchParams.get('next');
    const err = searchParams.get('error');

    // Immediately sanitize browser address bar to prevent token leakage in history
    if (typeof window !== 'undefined' && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

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

          const safeNext = getSafeRedirect(returnUrlParam);
          let defaultDestination = '/dashboard';
          if (res.user.role === 'CEO' || res.user.role === 'ADMIN' || res.user.role === 'MD') {
            defaultDestination = '/admin/dashboard';
          }

          const destination = safeNext || defaultDestination;
          router.replace(destination);
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
              <span>Completing Secure Authentication...</span>
            </div>
            <p className="text-xs text-muted">Securing your session token and initializing workspace.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center px-4">
          <div className="flex flex-col items-center space-y-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <p className="text-xs text-muted">Completing authentication...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </React.Suspense>
  );
}
