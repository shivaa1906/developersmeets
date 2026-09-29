'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { Terminal, Shield, CheckCircle2, Briefcase, Code2, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { login: setAuthSession } = useAuth();

  const initialTab =
    searchParams.get('tab') === 'developer' || searchParams.get('role') === 'developer'
      ? 'DEVELOPER'
      : 'CLIENT';

  const [roleTab, setRoleTab] = React.useState<'CLIENT' | 'DEVELOPER'>(initialTab);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = React.useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = React.useState(false);
  const [devSubmitted, setDevSubmitted] = React.useState(false);

  const handleGoogleRegister = () => {
    if (isGoogleLoading || isFacebookLoading || isDiscordLoading) return;
    setIsGoogleLoading(true);
    window.location.href = '/api/auth/google';
  };

  const handleFacebookRegister = () => {
    if (isGoogleLoading || isFacebookLoading || isDiscordLoading) return;
    setIsFacebookLoading(true);
    window.location.href = '/api/auth/facebook';
  };

  const handleDiscordRegister = () => {
    if (isGoogleLoading || isFacebookLoading || isDiscordLoading) return;
    setIsDiscordLoading(true);
    window.location.href = '/api/auth/discord';
  };

  // Client form state
  const [clientData, setClientData] = React.useState({
    companyName: '',
    privateName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  // Developer form state
  const [devData, setDevData] = React.useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    location: '',
    roleTitle: '',
    experience: '3',
    skills: 'TypeScript, Next.js, Node.js, PostgreSQL',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    bio: '',
  });

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (clientData.password.length < 8) {
      addToast('error', 'Password Too Short', 'Password must be at least 8 characters long.');
      return;
    }

    if (clientData.password !== clientData.confirmPassword) {
      addToast('error', 'Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiClient.post<{ token: string; user: any; client: any }>('/auth/register/client', {
        companyName: clientData.companyName.trim() || undefined,
        privateName: clientData.privateName.trim(),
        email: clientData.email.trim(),
        phone: clientData.phone.trim() || undefined,
        password: clientData.password,
        confirmPassword: clientData.confirmPassword,
      });

      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }

      addToast(
        'success',
        'Client Account Created',
        `Welcome to Nexus! Your client identifier is ${res.client?.client_number || res.user?.clientNumber || 'Client'}.`
      );

      router.push('/dashboard');
    } catch (err: any) {
      addToast('error', 'Registration Failed', err.message || 'Failed to create client account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const skillsArray = devData.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await apiClient.post('/auth/register/developer', {
        ...devData,
        skills: skillsArray,
      });

      setDevSubmitted(true);
      addToast(
        'success',
        'Application Submitted',
        'Your profile status is PENDING_VERIFICATION. Executive leadership will review your credentials.'
      );
    } catch (err: any) {
      addToast('error', 'Application Failed', err.message || 'Failed to submit developer application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (devSubmitted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <Card className="max-w-md text-center p-6 space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-warning/10 text-status-warning border border-status-warning/30">
            <Shield className="h-7 w-7" />
          </div>
          <Badge variant="warning">PENDING_VERIFICATION</Badge>
          <h2 className="text-xl font-bold text-foreground">Application Under Executive Review</h2>
          <p className="text-xs text-muted leading-relaxed">
            Thank you for applying to the Nexus Developer Network. To preserve technical integrity, every applicant undergoes direct review by executive leadership before gaining marketplace claiming and private community access.
          </p>
          <div className="pt-4 flex flex-col space-y-2">
            <Link href="/login">
              <Button size="sm" className="w-full">
                Go to Sign In
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm" className="w-full">
                Back to Home
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Terminal className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-wider text-foreground">
            NEXUS<span className="text-accent">.DEV</span>
          </span>
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Create an Account</h1>
        <p className="text-xs text-muted">
          Select your account type to access verified development pipelines and secure project delivery.
        </p>
      </div>

      {/* Role Selection Tabs */}
      <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-raised rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setRoleTab('CLIENT')}
          className={`flex flex-col items-center justify-center p-3 rounded-lg text-xs font-semibold transition-all ${
            roleTab === 'CLIENT'
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted hover:text-foreground bg-surface-elevated'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Briefcase className="h-4 w-4" />
            <span className="font-bold">I am a Client</span>
          </div>
          <span className="text-[11px] opacity-80 mt-0.5">I want to hire developers</span>
        </button>
        <button
          type="button"
          onClick={() => setRoleTab('DEVELOPER')}
          className={`flex flex-col items-center justify-center p-3 rounded-lg text-xs font-semibold transition-all ${
            roleTab === 'DEVELOPER'
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted hover:text-foreground bg-surface-elevated'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Code2 className="h-4 w-4" />
            <span className="font-bold">I am a Developer</span>
          </div>
          <span className="text-[11px] opacity-80 mt-0.5">I want to join the developer network</span>
        </button>
      </div>

      {/* CLIENT REGISTRATION FORM */}
      {roleTab === 'CLIENT' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Client Onboarding</span>
              <Badge variant="success">Instant Activation</Badge>
            </CardTitle>
            <CardDescription>
              Register your organization to post projects, review developer proposals, and coordinate in private anonymous chat.
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
                <span>Continue with Google</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-11 border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-[#1877F2]/50 text-foreground font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all shadow-sm group"
                onClick={handleFacebookRegister}
                isLoading={isFacebookLoading}
              >
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                  <path
                    fill="#1877F2"
                    d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                  />
                </svg>
                <span>Continue with Facebook</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-11 border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-[#5865F2]/50 text-foreground font-semibold text-sm flex items-center justify-center space-x-2.5 transition-all shadow-sm group"
                onClick={handleDiscordRegister}
                isLoading={isDiscordLoading}
              >
                <svg className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span>Continue with Discord</span>
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

            <form onSubmit={handleClientSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Primary Contact Name / Full Name"
                  placeholder="Jane Doe"
                  value={clientData.privateName}
                  onChange={(e) => setClientData({ ...clientData, privateName: e.target.value })}
                  required
                />
                <Input
                  label="Company Name (Optional)"
                  placeholder="Acme Corp or Apex Retail"
                  value={clientData.companyName}
                  onChange={(e) => setClientData({ ...clientData, companyName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Work Email"
                  type="email"
                  placeholder="contact@acme.com"
                  value={clientData.email}
                  onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
                  required
                />
                <Input
                  label="Phone Number (Optional)"
                  type="tel"
                  placeholder="+1 (555) 012-3456"
                  value={clientData.phone}
                  onChange={(e) => setClientData({ ...clientData, phone: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={clientData.password}
                  onChange={(e) => setClientData({ ...clientData, password: e.target.value })}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter password"
                  value={clientData.confirmPassword}
                  onChange={(e) => setClientData({ ...clientData, confirmPassword: e.target.value })}
                  required
                  minLength={8}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                  Register Organization & Access Dashboard
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* DEVELOPER REGISTRATION FORM */}
      {roleTab === 'DEVELOPER' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Developer Candidate Profile</span>
              <Badge variant="warning">Executive Review</Badge>
            </CardTitle>
            <CardDescription>
              Apply to claim credit-backed client projects, join the private developer community, and build public attributions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDevSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  placeholder="Rahul Sharma"
                  value={devData.fullName}
                  onChange={(e) => setDevData({ ...devData, fullName: e.target.value })}
                  required
                />
                <Input
                  label="Username"
                  placeholder="rahul-sharma"
                  value={devData.username}
                  onChange={(e) => setDevData({ ...devData, username: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="rahul@example.com"
                  value={devData.email}
                  onChange={(e) => setDevData({ ...devData, email: e.target.value })}
                  required
                />
                <Input
                  label="Phone (Optional)"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={devData.phone}
                  onChange={(e) => setDevData({ ...devData, phone: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={devData.password}
                  onChange={(e) => setDevData({ ...devData, password: e.target.value })}
                  required
                  minLength={8}
                />
                <Input
                  label="Location"
                  placeholder="Bengaluru, India"
                  value={devData.location}
                  onChange={(e) => setDevData({ ...devData, location: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Role Title"
                  placeholder="Full Stack Engineer"
                  value={devData.roleTitle}
                  onChange={(e) => setDevData({ ...devData, roleTitle: e.target.value })}
                  required
                />
                <Input
                  label="Years of Experience"
                  type="number"
                  placeholder="4"
                  value={devData.experience}
                  onChange={(e) => setDevData({ ...devData, experience: e.target.value })}
                  required
                />
              </div>

              <Input
                label="Technical Skills (Comma separated)"
                placeholder="TypeScript, Next.js, Node.js, PostgreSQL, Docker"
                value={devData.skills}
                onChange={(e) => setDevData({ ...devData, skills: e.target.value })}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="GitHub Profile URL"
                  placeholder="https://github.com/..."
                  value={devData.githubUrl}
                  onChange={(e) => setDevData({ ...devData, githubUrl: e.target.value })}
                  required
                />
                <Input
                  label="LinkedIn URL"
                  placeholder="https://linkedin.com/in/..."
                  value={devData.linkedinUrl}
                  onChange={(e) => setDevData({ ...devData, linkedinUrl: e.target.value })}
                />
                <Input
                  label="Portfolio / Website URL"
                  placeholder="https://..."
                  value={devData.portfolioUrl}
                  onChange={(e) => setDevData({ ...devData, portfolioUrl: e.target.value })}
                />
              </div>

              <Textarea
                label="Bio & Experience Overview"
                placeholder="Describe your architectural background, distributed system experience, and specialties..."
                value={devData.bio}
                onChange={(e) => setDevData({ ...devData, bio: e.target.value })}
                rows={3}
              />

              <div className="pt-2">
                <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                  Submit Application for Executive Verification
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted">
        <span>Already have an account? </span>
        <Link href="/login" className="text-accent hover:underline font-medium">
          Sign In
        </Link>
      </div>
    </div>
  );
}
