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
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface ActiveProject {
  id: string;
  project_number: string;
  title: string;
  status: string;
}

interface TransitionData {
  currentAccount: {
    userId: string;
    uid: string;
    email: string;
    role: string;
    clientNumber?: string;
    companyName?: string;
    status: string;
  };
  options: {
    optionA: {
      id: string;
      title: string;
      description: string;
      keepsClientActive: boolean;
      requiresVerification: boolean;
      nextStep: string;
    };
    optionB: {
      id: string;
      title: string;
      description: string;
      canDeactivate: boolean;
      blockingReasons: string[];
      activeProjects: ActiveProject[];
      confirmationRequired: boolean;
      confirmationPhrase: string;
      alternateConfirmationPhrase: string;
      nextStep: string;
    };
  };
}

export default function JoinDeveloperPage() {
  const router = useRouter();
  const { user, isLoading, isDeveloper, isClient, isExecutive, isSupport, logout } = useAuth();
  const { addToast } = useToast();

  const [transitionData, setTransitionData] = React.useState<TransitionData | null>(null);
  const [loadingTransition, setLoadingTransition] = React.useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = React.useState(false);
  const [confirmationInput, setConfirmationInput] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Load transition data from server for authenticated clients
  React.useEffect(() => {
    if (!isLoading && user && isClient) {
      setLoadingTransition(true);
      apiClient
        .get<TransitionData>('/auth/account/developer-transition')
        .then((data) => {
          setTransitionData(data);
        })
        .catch((err: any) => {
          setErrorMsg(err.message || 'Failed to load developer transition status.');
        })
        .finally(() => {
          setLoadingTransition(false);
        });
    }
  }, [isLoading, user, isClient]);

  // Handle Option A: Create Separate Developer Account
  const handleSelectOptionA = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await apiClient.post('/auth/account/developer-transition/start', {
        option: 'OPTION_A',
      });
      addToast(
        'info',
        'Proceeding to Developer Registration',
        'Your existing Client account remains completely active and preserved. Please register your developer profile using a distinct email.'
      );
      router.push('/register/developer?from=client');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to proceed with developer registration.');
      addToast('error', 'Transition Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Option B: Deactivate Client Account & Continue
  const handleDeactivateClientAccount = async () => {
    const trimmed = confirmationInput.trim();
    if (trimmed !== 'DEACTIVATE CLIENT ACCOUNT' && trimmed !== 'DELETE') {
      setErrorMsg("Please type 'DEACTIVATE CLIENT ACCOUNT' or 'DELETE' to confirm.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      await apiClient.post('/auth/account/developer-transition/deactivate-client', {
        confirmation: trimmed,
      });

      addToast(
        'success',
        'Client Account Deactivated',
        'Your client account has been safely deactivated. Historical records and projects remain preserved. Redirecting to developer registration...'
      );

      logout();
      router.push('/register/developer?from=transition_deactivated');
    } catch (err: any) {
      const msg =
        err.message ||
        'Your account has active projects. Please resolve or transfer those projects before deactivating your client account.';
      setErrorMsg(msg);
      addToast('error', 'Deactivation Blocked', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading || (isClient && loadingTransition)) {
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

  // 1. Unauthenticated Visitor: Prompt to log in or register directly
  if (!user) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg border-border bg-surface/90 text-center">
          <CardHeader className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 border border-accent/40 text-accent">
              <Code2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold">Join the Developer Network</CardTitle>
            <CardDescription className="text-xs text-muted max-w-md mx-auto">
              Nexus connects top-tier engineering talent with real, high-impact enterprise software projects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted text-left">
            <div className="p-3.5 rounded-lg bg-surface-elevated border border-border space-y-2">
              <div className="flex items-center space-x-2 text-foreground font-semibold">
                <UserPlus className="h-4 w-4 text-accent" />
                <span>New to Nexus?</span>
              </div>
              <p className="text-muted text-[11px] leading-relaxed">
                You can create a new Developer profile immediately. After registration, your portfolio and technical background will undergo verification.
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-surface-elevated border border-border space-y-2">
              <div className="flex items-center space-x-2 text-foreground font-semibold">
                <ShieldAlert className="h-4 w-4 text-status-warning" />
                <span>Already have a Client account?</span>
              </div>
              <p className="text-muted text-[11px] leading-relaxed">
                Log in first to view your transition options: either keep your client account active with a separate developer profile, or deactivate it safely.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/register/developer">
              <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Register as Developer
              </Button>
            </Link>
            <Link href="/login?redirect=/join-developer">
              <Button variant="outline" size="sm">
                Log In as Client
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 2. Already logged in as Developer
  if (isDeveloper && !isExecutive) {
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

  // 3. Executive Leadership / Support accounts
  if (isExecutive || isSupport) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg border-border bg-surface/90 text-center">
          <CardHeader className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated border border-border text-muted">
              <Lock className="h-7 w-7 text-status-warning" />
            </div>
            <CardTitle className="text-xl font-bold">Administrative & Support Role</CardTitle>
            <CardDescription className="text-xs text-muted">
              You are currently authenticated with administrative or platform support authority (<strong className="text-foreground">{user.role}</strong>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted">
            <p>
              Governance and operational accounts cannot enter the client-to-developer transition workflow. If you require a dedicated developer account for technical tasks, please register with a distinct development identity.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center pt-2">
            <Link href={isExecutive ? '/admin/dashboard' : '/dashboard'}>
              <Button size="sm" variant="outline">
                Return to Dashboard
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 4. Authenticated Client: Present Phase 8 Options
  const canDeactivate = transitionData?.options.optionB.canDeactivate ?? true;
  const activeProjects = transitionData?.options.optionB.activeProjects || [];

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-status-warning/10 border border-status-warning/30 text-status-warning mb-2">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Join as a Developer
          </h1>
          <p className="text-xs text-muted max-w-md mx-auto">
            Your current account is registered as a <strong className="text-foreground">Client</strong> (
            <span className="font-mono text-accent">{user.clientNumber || user.email}</span>).
            You can become a Developer in one of two ways:
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!showDeactivateConfirm ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OPTION A: Separate Developer Account */}
            <Card className="flex flex-col justify-between border-border hover:border-accent transition-all bg-surface/90">
              <CardHeader className="space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 border border-accent/30 text-accent">
                  <UserPlus className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-semibold">
                  OPTION A: Create a separate Developer account
                </CardTitle>
                <CardDescription className="text-xs text-muted leading-relaxed space-y-1.5 pt-1">
                  <span className="block text-foreground font-medium">• Your existing Client account remains active.</span>
                  <span className="block">• Your client projects and history remain unchanged.</span>
                  <span className="block">• You will register a separate Developer account.</span>
                  <span className="block">• Developer verification is required before approval.</span>
                  <span className="block text-[11px] text-muted pt-1">
                    Note: A separate Developer account requires a different email address.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleSelectOptionA}
                  isLoading={isProcessing}
                  rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Create Separate Developer Account
                </Button>
              </CardFooter>
            </Card>

            {/* OPTION B: Deactivate Client Account and Continue */}
            <Card className="flex flex-col justify-between border-border hover:border-status-danger/60 transition-all bg-surface/90">
              <CardHeader className="space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger">
                  <Trash2 className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-semibold text-status-danger">
                  OPTION B: Deactivate Client and continue as Developer
                </CardTitle>
                <CardDescription className="text-xs text-muted leading-relaxed space-y-1.5 pt-1">
                  <span className="block text-foreground font-medium">• Your Client account will be safely deactivated.</span>
                  <span className="block">• You will no longer use it for new client activity.</span>
                  <span className="block">• Historical projects and invoices remain preserved.</span>
                  <span className="block">• You will continue through Developer registration.</span>
                  {!canDeactivate && (
                    <span className="block font-medium text-status-danger text-[11px] pt-1">
                      Blocked: You have {activeProjects.length} active project(s) in progress.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  disabled={!canDeactivate}
                  onClick={() => setShowDeactivateConfirm(true)}
                >
                  {canDeactivate ? 'Deactivate Client & Continue' : 'Deactivation Blocked'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          /* Confirmation Screen for Option B */
          <Card className="border-status-danger/40 bg-surface/95 p-4 sm:p-6 space-y-4">
            <CardHeader className="p-0 space-y-1">
              <div className="flex items-center space-x-2 text-status-danger">
                <AlertCircle className="h-5 w-5" />
                <CardTitle className="text-base font-bold">
                  Confirm Client Account Deactivation
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted">
                This action disables your Client account (<span className="text-foreground font-mono">{user.email}</span>) and terminates all active sessions. Historical records, past projects, and financial transactions are strictly preserved in compliance with platform audit standards.
              </CardDescription>
            </CardHeader>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-foreground block">
                To confirm, type <span className="font-mono font-bold text-status-danger">DEACTIVATE CLIENT ACCOUNT</span> in the box below:
              </label>
              <Input
                type="text"
                placeholder="DEACTIVATE CLIENT ACCOUNT"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                className="max-w-md font-mono"
                autoFocus
              />
            </div>

            <CardFooter className="p-0 pt-4 flex flex-col sm:flex-row gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDeactivateConfirm(false);
                  setErrorMsg(null);
                  setConfirmationInput('');
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeactivateClientAccount}
                isLoading={isProcessing}
                disabled={
                  confirmationInput.trim() !== 'DEACTIVATE CLIENT ACCOUNT' &&
                  confirmationInput.trim() !== 'DELETE'
                }
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
