'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Code2, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function JoinDeveloperPage() {
  const router = useRouter();
  const { user, isLoading, isDeveloper, isClient, logout } = useAuth();

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/register/developer');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 border border-accent/30 text-accent animate-pulse">
            <Code2 className="h-5 w-5 animate-spin" />
          </div>
          <p className="text-xs text-muted">Checking developer network status...</p>
        </div>
      </div>
    );
  }

  // If already logged in as developer
  if (user && isDeveloper) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg border-accent/40 bg-surface/90 text-center">
          <CardHeader className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 border border-accent/40 text-accent">
              <CheckCircle2 className="h-7 w-7 text-status-success" />
            </div>
            <CardTitle className="text-xl font-bold">Already a Verified Network Developer</CardTitle>
            <CardDescription className="text-xs text-muted">
              You are signed in as <strong className="text-foreground">{user.name || user.email}</strong> with active developer credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted">
            <p>
              Your profile is registered in our network. You have full access to marketplace claims, technical proposals, credit transactions, and developer community channels.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Open Dashboard
              </Button>
            </Link>
            <Link href="/dashboard/projects">
              <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Browse Marketplace Projects
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // If logged in as client
  if (user && isClient) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg border-border bg-surface/90 text-center">
          <CardHeader className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated border border-border text-status-warning">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold">Client Account Active</CardTitle>
            <CardDescription className="text-xs text-muted">
              You are currently logged in with a Client profile ({user.clientNumber || user.email}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted">
            <p>
              Developer network registration requires a dedicated engineer account. To join as a developer, you may register a separate developer account.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Return to Client Dashboard
              </Button>
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                logout();
                router.push('/register/developer');
              }}
            >
              Sign Out & Register as Developer
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="text-center space-y-3">
        <p className="text-xs text-muted">Redirecting to developer registration...</p>
      </div>
    </div>
  );
}
