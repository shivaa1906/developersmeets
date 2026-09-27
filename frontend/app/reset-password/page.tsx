'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Terminal, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  const tokenParam = searchParams.get('token') || '';
  const [token, setToken] = React.useState(tokenParam);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  React.useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [tokenParam]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      addToast('error', 'Password Too Short', 'Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast('error', 'Mismatch', 'Passwords do not match.');
      return;
    }

    if (!token) {
      addToast('error', 'Token Required', 'Password reset token is missing.');
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.post('/auth/reset-password', {
        resetToken: token,
        newPassword,
        confirmPassword,
      });

      setIsSuccess(true);
      addToast('success', 'Password Updated', 'Your password has been reset successfully. Please sign in.');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      addToast('error', 'Reset Failed', err.message || 'Failed to update password.');
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reset Password</h1>
          <p className="text-xs text-muted">Create a new secure password for your platform account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Set New Password</span>
              <Lock className="h-4 w-4 text-accent" />
            </CardTitle>
            <CardDescription>
              Enter and confirm your new password below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success/10 text-status-success border border-status-success/30">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Password Reset Complete</h3>
                <p className="text-xs text-muted">
                  Your credentials have been securely updated. Redirecting to sign in...
                </p>
                <Link href="/login">
                  <Button size="sm" className="w-full">
                    Go to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <Input
                  label="Reset Token"
                  placeholder="Paste reset token if not detected"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
                <Input
                  label="New Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="Confirm matching password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                  Update Password
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
            <Link href="/login" className="text-accent hover:underline flex items-center space-x-1">
              <ArrowLeft className="h-3 w-3" />
              <span>Back to Sign In</span>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
