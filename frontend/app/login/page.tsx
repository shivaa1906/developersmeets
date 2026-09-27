'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  Terminal,
  ShieldCheck,
  ArrowRight,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

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
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiClient.post<{ token: string; user: any; redirectUrl?: string }>(
        '/auth/login',
        {
          email: email.trim().toLowerCase(),
          password,
        }
      );

      setAuthSession(data.token, data.user);

      // Check for user-specified safe destination query param (?returnUrl, ?redirect, or ?next)
      const requestedNext = searchParams.get('returnUrl') || searchParams.get('redirect') || searchParams.get('next');
      const safeNext = getSafeRedirect(requestedNext);
      const destination = safeNext || data.redirectUrl || '/dashboard';

      addToast(
        'success',
        'Authentication Successful',
        `Welcome back, ${data.user.name || data.user.email}!`
      );

      router.push(destination);
    } catch (err: any) {
      const msg = err.message || 'Invalid email or password. Please verify your credentials.';
      setErrorMessage(msg);
      addToast('error', 'Authentication Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (role: 'CLIENT' | 'DEVELOPER') => {
    setErrorMessage(null);
    if (role === 'CLIENT') {
      setEmail('client001@apexretail.io');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Client #001 Selected', 'Credentials populated for Apex Retail Labs.');
    } else if (role === 'DEVELOPER') {
      setEmail('rahul@nexus.dev');
      setPassword('DevPlatform2026!Secure');
      addToast('info', 'Verified Developer Selected', 'Credentials populated for Rahul Kumar.');
    }
  };

  return (
    <div className="flex min-h-[88vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-[460px] space-y-6">
        {/* Brand & Heading Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center space-x-2.5 mb-2 group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent shadow-accent-glow transition-transform group-hover:scale-105">
              <Terminal className="h-5 w-5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold tracking-wider text-foreground">
                NEXUS<span className="text-accent">.DEV</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-muted">
                Enterprise Co.
              </span>
            </div>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Login to your account
          </h1>
          <p className="text-xs sm:text-sm text-muted max-w-sm mx-auto">
            Access your verified developer workspace or client management portal.
          </p>
        </div>

        {/* Elevated Professional Card */}
        <Card className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-surface-card backdrop-blur-xl">
          <CardContent className="p-0">
            {/* Error Notification */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/25 text-status-danger text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-status-danger" />
                <span className="leading-relaxed font-medium">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email Input with Mail Icon */}
              <Input
                label="Email Address"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="h-4 w-4" />}
                autoComplete="email"
                required
              />

              {/* Password Input with Lock Icon and Eye Visibility Toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium uppercase tracking-wider text-muted">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-accent hover:underline font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted hover:text-foreground focus:outline-none p-1 transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                  autoComplete="current-password"
                  required
                />
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent accent-accent transition-colors"
                  />
                  <span className="text-xs text-muted hover:text-foreground transition-colors">
                    Remember this device
                  </span>
                </label>
              </div>

              {/* Primary Sign In Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full h-11 font-semibold text-sm shadow-accent-glow mt-2"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Sign In to Workspace
              </Button>
            </form>

            {/* Clean Professional Demo Role Autofill */}
            <div className="mt-6 pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span>Demo Role Quick Fill</span>
                </span>
                <span className="text-[10px] font-mono text-muted bg-surface-elevated px-2 py-0.5 rounded border border-border">
                  1-Click Fill
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('CLIENT')}
                  className="flex flex-col items-start p-2 rounded-lg border border-border bg-surface-elevated hover:border-accent hover:bg-accent/5 transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="h-2 w-2 rounded-full bg-status-info" />
                    <span className="text-xs font-semibold text-foreground group-hover:text-accent">
                      Client
                    </span>
                  </div>
                  <span className="text-[10px] text-muted truncate w-full">Client #001</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('DEVELOPER')}
                  className="flex flex-col items-start p-2 rounded-lg border border-border bg-surface-elevated hover:border-accent hover:bg-accent/5 transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="h-2 w-2 rounded-full bg-status-success" />
                    <span className="text-xs font-semibold text-foreground group-hover:text-accent">
                      Developer
                    </span>
                  </div>
                  <span className="text-[10px] text-muted truncate w-full">Rahul Kumar</span>
                </button>
              </div>
            </div>

            {/* Security Guarantee Badge */}
            <div className="mt-5 pt-4 border-t border-border flex items-center justify-center space-x-2 text-[11px] text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-status-success shrink-0" />
              <span>End-to-end encrypted session • 256-bit SSL</span>
            </div>
          </CardContent>
        </Card>

        {/* Card Footer: Account Creation & Home Navigation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 text-xs text-muted">
          <Link
            href="/"
            className="inline-flex items-center space-x-1.5 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Home</span>
          </Link>

          <div>
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-accent font-semibold hover:underline transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
