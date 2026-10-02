'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Terminal, Briefcase, ArrowRight, ShieldCheck, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function ClientRegisterPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { login: setAuthSession } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = React.useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const isAnyLoading = isSubmitting || isGoogleLoading || isFacebookLoading || isDiscordLoading;

  const handleGoogleRegister = () => {
    if (isAnyLoading) return;
    setIsGoogleLoading(true);
    window.location.href = '/api/auth/google';
  };

  const handleFacebookRegister = () => {
    if (isAnyLoading) return;
    setIsFacebookLoading(true);
    window.location.href = '/api/auth/facebook';
  };

  const handleDiscordRegister = () => {
    if (isAnyLoading) return;
    setIsDiscordLoading(true);
    window.location.href = '/api/auth/discord';
  };

  const [formData, setFormData] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password.length < 8) {
      addToast('error', 'Password Too Short', 'Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      addToast('error', 'Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiClient.post<{ token: string; user: any; client: any; redirectUrl?: string }>(
        '/auth/register/client',
        {
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          companyName: formData.companyName.trim() || undefined,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        }
      );

      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }

      addToast(
        'success',
        'Account Created Successfully',
        `Welcome to Nexus! Your client identifier is ${res.client?.client_number || res.user?.clientNumber || 'Client'}.`
      );

      router.push(res.redirectUrl || '/dashboard');
    } catch (err: any) {
      addToast('error', 'Registration Failed', err.message || 'Unable to complete client registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent shadow-accent-glow">
            <Terminal className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-wider text-foreground">
            NEXUS<span className="text-accent">.DEV</span>
          </span>
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Hire Verified Developers</h1>
        <p className="text-xs text-muted max-w-md mx-auto">
          Create your client account to submit software projects, review competitive developer proposals, and manage delivery through secure workspaces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Briefcase className="h-4 w-4 text-accent" />
              <span>Client Organization Onboarding</span>
            </div>
            <Badge variant="success">Instant Activation</Badge>
          </CardTitle>
          <CardDescription>
            Enter your organization details below to access the verified developer marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5 mb-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-11 border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-accent/40 text-foreground font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all shadow-sm group"
              onClick={handleGoogleRegister}
              isLoading={isGoogleLoading}
              disabled={isAnyLoading}
              aria-label="Continue with Google registration"
            >
              <svg className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.26C.46 8.16 0 9.98 0 12s.46 3.84 1.26 5.43l4.02-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.64 1.26 6.57l4.02 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>{isGoogleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-11 border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-[#1877F2]/50 text-foreground font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all shadow-sm group"
              onClick={handleFacebookRegister}
              isLoading={isFacebookLoading}
              disabled={isAnyLoading}
              aria-label="Continue with Facebook registration"
            >
              <svg className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                <path
                  fill="#1877F2"
                  d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                />
              </svg>
              <span>{isFacebookLoading ? 'Connecting to Facebook…' : 'Continue with Facebook'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-11 border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-[#5865F2]/50 text-foreground font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all shadow-sm group"
              onClick={handleDiscordRegister}
              isLoading={isDiscordLoading}
              disabled={isAnyLoading}
              aria-label="Continue with Discord registration"
            >
              <svg className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24" fill="#5865F2">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>{isDiscordLoading ? 'Connecting to Discord…' : 'Continue with Discord'}</span>
            </Button>

            <div className="relative pt-1.5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface px-3 text-muted uppercase tracking-wider font-mono text-[10px]">
                  Or register with email
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name / Primary Contact"
                placeholder="Jane Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
              <Input
                label="Company Name (Optional)"
                placeholder="Acme Retail, LLC"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Work Email"
                type="email"
                placeholder="jane@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <Input
                label="Phone Number (Optional)"
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isAnyLoading}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded p-1 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                required
                minLength={8}
              />
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                disabled={isAnyLoading}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded p-1 transition-colors"
                    title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                required
                minLength={8}
              />
            </div>

            <div className="p-3 bg-surface-raised rounded-md border border-border flex items-start space-x-2 text-[11px] text-muted">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span>
                Your identity is shielded during the initial proposal phase. Developers interact with your project through an anonymous company tag until selection.
              </span>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
              Create Client Account & Go to Dashboard
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
          <Link href="/login" className="hover:text-foreground">
            Already registered? <span className="text-accent hover:underline font-medium">Sign In</span>
          </Link>
          <Link href="/register" className="text-muted hover:text-foreground">
            Applying as developer? <span className="text-accent hover:underline font-medium">Developer Portal</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
