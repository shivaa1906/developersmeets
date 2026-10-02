'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Terminal, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [email, setEmail] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    try {
      await apiClient.post<{ message: string }>('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });

      setSubmitted(true);
      addToast(
        'success',
        'Reset Request Dispatched',
        'If the email is registered, password recovery instructions have been sent.'
      );
    } catch (err: any) {
      addToast('error', 'Request Failed', err.message || 'Failed to submit reset request.');
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Forgot Password</h1>
          <p className="text-xs text-muted">Enter your registered email address to receive reset credentials.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Account Recovery</span>
              <KeyRound className="h-4 w-4 text-accent" />
            </CardTitle>
            <CardDescription>
              We will issue a secure, single-use reset link valid for 1 hour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success/10 text-status-success border border-status-success/30">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Recovery Instructions Dispatched</h3>
                  <p className="text-xs text-muted leading-relaxed">
                    If an account is associated with <span className="text-foreground font-medium">{email}</span>, a secure password reset link has been dispatched to your inbox.
                  </p>
                </div>

                <div className="p-3 bg-surface-raised rounded-md border border-border text-left space-y-2">
                  <span className="text-[11px] font-medium text-foreground block">
                    Already have your reset token?
                  </span>
                  <Link href="/reset-password">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Enter Reset Token
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Registered Email"
                  type="email"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
                <Button type="submit" className="w-full" size="lg" isLoading={isLoading} disabled={isLoading}>
                  Request Password Reset
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
            <Link href="/login" className="text-accent hover:underline flex items-center space-x-1">
              <ArrowLeft className="h-3 w-3" />
              <span>Back to Sign In</span>
            </Link>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
