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
  const [devSubmitted, setDevSubmitted] = React.useState(false);

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
      <div className="grid grid-cols-2 gap-2 p-1 bg-surface-raised rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setRoleTab('CLIENT')}
          className={`flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md text-xs font-semibold transition-all ${
            roleTab === 'CLIENT'
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          <span>Hire Developers (Client)</span>
        </button>
        <button
          type="button"
          onClick={() => setRoleTab('DEVELOPER')}
          className={`flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md text-xs font-semibold transition-all ${
            roleTab === 'DEVELOPER'
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <Code2 className="h-4 w-4" />
          <span>Join as Developer</span>
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
