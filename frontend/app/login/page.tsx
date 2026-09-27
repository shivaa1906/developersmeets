'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Terminal, Shield, ArrowRight, Lock, KeyRound, AlertTriangle } from 'lucide-react';

function getSafeRedirect(candidate: string | null): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  if (trimmed.includes('://') || /^(?:javascript|data|vbscript):/i.test(trimmed)) return null;
  if (!/^\/[a-zA-Z0-9_\-\/\?=&%#\.]*$/.test(trimmed)) return null;
  return trimmed;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { login: setAuthSession } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiClient.post<{ token: string; user: any; redirectUrl?: string }>('/auth/login', {
        email,
        password,
      });

      setAuthSession(data.token, data.user);

      // Check for user-specified safe destination query param (?redirect or ?next)
      const requestedNext = searchParams.get('redirect') || searchParams.get('next');
      const safeNext = getSafeRedirect(requestedNext);
      const destination = safeNext || data.redirectUrl || '/dashboard';

      addToast(
        'success',
        'Authentication Successful',
        `Signed in as ${data.user.name || data.user.email} (${data.user.role})`
      );

      router.push(destination);
    } catch (err: any) {
      const msg = err.message || 'Invalid email or password.';
      setErrorMessage(msg);
      addToast('error', 'Authentication Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (role: 'CLIENT' | 'DEVELOPER' | 'SUPPORT' | 'ADMIN' | 'CEO' | 'MD') => {
    setErrorMessage(null);
    if (role === 'CLIENT') {
      setEmail('client001@apexretail.io');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Client Profile Autofilled', 'Apex Retail Labs (Client #001)');
    } else if (role === 'DEVELOPER') {
      setEmail('rahul@nexus.dev');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Verified Developer Autofilled', 'Rahul Kumar');
    } else if (role === 'SUPPORT') {
      setEmail('support@nexus.dev');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Support Specialist Autofilled', 'Platform Support Operations');
    } else if (role === 'ADMIN') {
      setEmail('admin@nexus.dev');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Platform Admin Autofilled', 'Platform Administrator');
    } else if (role === 'CEO') {
      setEmail('shivaa1906@gmail.com');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'CEO Profile Autofilled', 'M. Shiva Gopi');
    } else if (role === 'MD') {
      setEmail('md@example.invalid');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'MD Profile Autofilled', 'Development MD Placeholder');
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="text-base font-bold tracking-wider text-foreground">
              NEXUS<span className="text-accent">.DEV</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign In to Platform</h1>
          <p className="text-xs text-muted">
            Enter your credentials. Your verified role and permissions are server-authenticated.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Authentication</span>
              <Shield className="h-4 w-4 text-accent" />
            </CardTitle>
            <CardDescription>Enter your email and password to access your portal</CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="name@nexus.dev or name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Password</span>
                  <Link href="/forgot-password" className="text-accent hover:underline text-[11px]">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                Sign In
              </Button>
            </form>

            {/* Quick Demo Access Bar */}
            <div className="mt-6 pt-4 border-t border-border">
              <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-2">
                Quick Role Autofill (Demo & Testing)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('CLIENT')}
                  className="text-[11px] h-8 border-accent/30 text-accent hover:bg-accent/10"
                >
                  Client #001
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('DEVELOPER')}
                  className="text-[11px] h-8"
                >
                  Developer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('SUPPORT')}
                  className="text-[11px] h-8"
                >
                  Support
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('ADMIN')}
                  className="text-[11px] h-8"
                >
                  Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('CEO')}
                  className="text-[11px] h-8"
                >
                  CEO Shiva
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('MD')}
                  className="text-[11px] h-8"
                >
                  MD Sample
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
            <Link href="/" className="hover:text-foreground">
              Return Home
            </Link>
            <Link href="/register" className="text-accent hover:underline flex items-center space-x-1 font-medium">
              <span>Create Account</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
