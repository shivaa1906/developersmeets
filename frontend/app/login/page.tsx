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
import { Terminal, Shield, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { login: setAuthSession } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const data = await apiClient.post<{ token: string; user: any }>('/auth/login', {
        email,
        password,
      });

      setAuthSession(data.token, data.user);

      const redirect = searchParams.get('redirect');
      if (redirect && redirect.startsWith('/')) {
        addToast('success', 'Authentication Successful', `Welcome back, ${data.user.email}`);
        router.push(redirect);
        return;
      }

      if (data.user.role === 'CEO' || data.user.role === 'ADMIN' || data.user.role === 'MD') {
        addToast('success', 'Executive Authenticated', `Logged in as ${data.user.name || data.user.email}`);
        router.push('/admin/dashboard');
      } else {
        addToast('success', 'Authentication Successful', `Welcome back, ${data.user.email}`);
        router.push('/dashboard');
      }
    } catch (err: any) {
      addToast('error', 'Login Failed', err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (role: 'CLIENT' | 'DEVELOPER' | 'CEO' | 'MD') => {
    if (role === 'CLIENT') {
      setEmail('client001@apexretail.io');
      setPassword('password123');
      addToast('info', 'Client Profile Loaded', 'Signing in as Client #001 (Apex Retail Labs)');
    } else if (role === 'DEVELOPER') {
      setEmail('rahul@nexus.dev');
      setPassword('password123');
      addToast('info', 'Verified Developer Profile Loaded', 'Signing in as Rahul Kumar');
    } else if (role === 'CEO') {
      setEmail('ritesh@nexus.dev');
      setPassword('password123');
      addToast('info', 'Executive CEO Profile Loaded', 'Signing in as Ritesh Lingamallu');
    } else if (role === 'MD') {
      setEmail('shiva@nexus.dev');
      setPassword('password123');
      addToast('info', 'Managing Director Profile Loaded', 'Signing in as M. Shiva Gopi');
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
          <p className="text-xs text-muted">Access your workspace, credits ledger, and anonymous project chat.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Authentication</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="name@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                Sign In
              </Button>
            </form>

            {/* Quick Demo Access Bar */}
            <div className="mt-6 pt-4 border-t border-border">
              <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-2">
                Quick Role Autofill
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  onClick={() => handleQuickLogin('CEO')}
                  className="text-[11px] h-8"
                >
                  CEO Ritesh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('MD')}
                  className="text-[11px] h-8"
                >
                  MD Shiva
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
            <Link href="/" className="hover:text-foreground">
              Return Home
            </Link>
            <Link href="/register" className="text-accent hover:underline">
              New Developer? Register
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
