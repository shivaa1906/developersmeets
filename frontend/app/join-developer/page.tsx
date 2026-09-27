'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import {
  Code2,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  UserPlus,
  Trash2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

export default function JoinDeveloperPage() {
  const router = useRouter();
  const { user, isLoading, isDeveloper, isClient, logout } = useAuth();
  const { addToast } = useToast();

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deletionError, setDeletionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/register/developer');
    }
  }, [isLoading, user, router]);

  const handleDeleteClientAccount = async () => {
    if (deleteConfirmationText.trim() !== 'DELETE') {
      setDeletionError("Please type DELETE to confirm account deactivation.");
      return;
    }

    setIsDeleting(true);
    setDeletionError(null);

    try {
      await apiClient.post('/auth/delete-account', {
        confirmation: 'DELETE',
      });

      addToast(
        'success',
        'Client Account Deactivated',
        'Your client profile has been safely deactivated. Redirecting to Developer registration...'
      );

      logout();
      router.push('/register/developer');
    } catch (err: any) {
      const errorMsg =
        err.message ||
        'Your account has active projects. Please resolve or transfer those projects before deleting the account.';
      setDeletionError(errorMsg);
      addToast('error', 'Deactivation Blocked', errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

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

  // If logged in as client: Present explicit choice (Section 14)
  if (user && isClient) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-status-warning/10 border border-status-warning/30 text-status-warning mb-2">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              You already have a Client account.
            </h1>
            <p className="text-xs text-muted max-w-md mx-auto">
              You are currently signed in as <strong className="text-foreground">{user.clientNumber || user.email}</strong>.
              Developer network accounts operate with distinct identity semantics. Choose your preferred approach:
            </p>
          </div>

          {!showDeleteConfirm ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: Separate Developer Account */}
              <Card className="flex flex-col justify-between border-border hover:border-accent transition-all bg-surface/90">
                <CardHeader className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 border border-accent/30 text-accent">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-semibold">
                    Create a separate Developer account
                  </CardTitle>
                  <CardDescription className="text-xs text-muted leading-relaxed">
                    Recommended. Keep your existing Client account, project history, payments, and support records completely untouched. Register a dedicated developer profile using a separate email address.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      logout();
                      router.push('/register/developer');
                    }}
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Create a separate Developer account
                  </Button>
                </CardFooter>
              </Card>

              {/* Option B: Delete Client & Continue */}
              <Card className="flex flex-col justify-between border-border hover:border-status-danger/60 transition-all bg-surface/90">
                <CardHeader className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base font-semibold text-status-danger">
                    Delete my Client account and continue as Developer
                  </CardTitle>
                  <CardDescription className="text-xs text-muted leading-relaxed">
                    Safely deactivate your current Client profile. Note: Accounts with active projects or unresolved milestones cannot be deactivated until those projects are settled.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete my Client account and continue as Developer
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ) : (
            /* Explicit Confirmation Dialog (Section 22) */
            <Card className="border-status-danger/40 bg-surface/95 p-4 sm:p-6 space-y-4">
              <CardHeader className="p-0 space-y-1">
                <div className="flex items-center space-x-2 text-status-danger">
                  <AlertCircle className="h-5 w-5" />
                  <CardTitle className="text-base font-bold">
                    Confirm Client Account Deactivation
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted">
                  This action safely deactivates your client account (<span className="text-foreground font-mono">{user.email}</span>) and revokes active sessions. Historical financial records and past audit trails remain preserved.
                </CardDescription>
              </CardHeader>

              {deletionError && (
                <div className="p-3 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deletionError}</span>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-foreground block">
                  To confirm, type <span className="font-mono font-bold text-status-danger">DELETE</span> in the box below:
                </label>
                <Input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  className="max-w-xs font-mono"
                  autoFocus
                />
              </div>

              <CardFooter className="p-0 pt-4 flex flex-col sm:flex-row gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletionError(null);
                    setDeleteConfirmationText('');
                  }}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteClientAccount}
                  isLoading={isDeleting}
                  disabled={deleteConfirmationText.trim() !== 'DELETE'}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Confirm Deactivation & Continue
                </Button>
              </CardFooter>
            </Card>
          )}

          <div className="text-center pt-2">
            <Link href="/dashboard" className="text-xs text-muted hover:text-foreground transition-colors">
              &larr; Return to Client Dashboard
            </Link>
          </div>
        </div>
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
